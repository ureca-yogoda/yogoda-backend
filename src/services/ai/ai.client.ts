import axios from "axios";
import { env } from "../../core/config/env.js";
import {
  buildSystemPrompt,
  buildChatMetadataPrompt,
  buildSignupSystemPrompt,
  buildSignupMetadataPrompt,
  formatChoiceBenefitsForSignup,
} from "./ai.prompt.js";
import type {
  ChatDecision,
  PlanCandidate,
  SurveyAnswers,
  SurveyContext,
} from "../../types/chat.js";

const COLLECTED_INFO_SCHEMA = {
  type: "object",
  properties: {
    usageType: { type: "string" },
    monthlyData: { type: "string" },
    contentPreference: { type: "string" },
    benefitPreference: { type: "string" },
    planPriority: { type: "string" },
    recommendationPriority: { type: "string" },
  },
};

// 2차(메타데이터 전용) 호출용 — message 필드는 1차 스트리밍에서 이미 확보했으므로 뺌
const RESPONSE_METADATA_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["ask", "recommend"] },
    collectedInfo: COLLECTED_INFO_SCHEMA,
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          matchRate: { type: "number" },
          reason: { type: "string" },
        },
        required: ["code", "matchRate", "reason"],
      },
    },
    quickReplies: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["action"],
};

interface GetChatDecisionParams {
  message: string;
  // Gemini Interactions API가 서버 쪽에서 대화 맥락을 이어가도록 하는 토큰.
  // 없으면 새 대화로 시작함. (raw 대화 기록을 매번 다시 보낼 필요가 없어짐)
  previousInteractionId?: string;
  surveyContext?: SurveyContext;
  collectedInfo?: SurveyAnswers;
  plans: PlanCandidate[];
  // 세션에 고정된 프롬프트 버전의 내용. 관리자가 관리하는 페르소나/대화 규칙 부분만 담고 있음
  promptContent: string;
  // 로그인 사용자의 현재 가입 요금제 code. AI 프롬프트에 명시해 환각으로 인한 중복 추천을 방지함
  currentPlanCode?: string | null;
}

interface ChatDecisionResult {
  decision: ChatDecision;
  // 다음 턴에 previousInteractionId로 그대로 다시 넣어줘야 대화가 이어짐
  interactionId: string;
}

interface InteractionStep {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
}

interface StreamInteractionParams {
  model: string;
  input: string;
  previousInteractionId?: string;
  systemInstruction: string;
}

interface StreamInteractionResult {
  text: string;
  interactionId: string;
}

/**
 * Gemini Interactions API를 진짜 실시간 스트리밍(SSE)으로 호출해, 텍스트 델타가
 * 도착하는 즉시 onChunk로 흘려보냅니다. (구조화된 JSON 응답이 아니라 순수 텍스트만
 * 받는 호출 전용 — response_format을 쓰지 않음)
 * 이벤트 형식(event_type/delta 등)은 관용적으로 처리해, 모르는 이벤트는 무시합니다.
 */
async function streamInteractionMessage(
  {
    model,
    input,
    previousInteractionId,
    systemInstruction,
  }: StreamInteractionParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamInteractionResult> {
  const response = await axios({
    method: "post",
    url: "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse",
    headers: { "x-goog-api-key": env.AI_API_KEY },
    responseType: "stream",
    signal,
    data: {
      model,
      input,
      ...(previousInteractionId
        ? { previous_interaction_id: previousInteractionId }
        : {}),
      system_instruction: systemInstruction,
      stream: true,
    },
  });

  return await new Promise<StreamInteractionResult>((resolve, reject) => {
    let buffer = "";
    let text = "";
    let interactionId: string | undefined;

    const stream = response.data as NodeJS.ReadableStream;

    stream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split("\n");
      // 마지막 줄은 아직 잘린 채일 수 있으니 버퍼에 남겨두고 다음 청크와 이어붙임
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonText = trimmed.slice(5).trim();
        if (!jsonText || jsonText === "[DONE]") continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(jsonText);
        } catch {
          continue;
        }

        // interactionId는 이벤트 종류에 따라 담기는 위치가 다름:
        // interaction.created/interaction.completed는 event.interaction.id,
        // interaction.status_update는 event.interaction_id (최상위 event.id는 없음)
        if (typeof event.id === "string") {
          interactionId = event.id;
        } else if (typeof event.interaction_id === "string") {
          interactionId = event.interaction_id;
        } else {
          const interaction = event.interaction as { id?: string } | undefined;
          if (typeof interaction?.id === "string") {
            interactionId = interaction.id;
          }
        }

        const delta = event.delta as
          { type?: string; text?: string } | undefined;
        if (
          event.event_type === "step.delta" &&
          delta?.type === "text" &&
          typeof delta.text === "string"
        ) {
          text += delta.text;
          onChunk(delta.text);
        }
      }
    });

    stream.on("end", () => {
      if (!interactionId) {
        reject(new Error("AI_RESPONSE_INVALID"));
        return;
      }
      resolve({ text, interactionId });
    });

    stream.on("error", (err) => reject(err));
  });
}

/**
 * Gemini Interactions API로 대화를 이어갑니다.
 * generateContent와 달리 대화 전체를 매번 다시 보내지 않고, previous_interaction_id만
 * 넘기면 구글 서버가 이전 대화 맥락을 자동으로 이어붙여줍니다.
 * (system_instruction/response_format은 "이번 턴 한정" 값이라 매번 새로 만들어서 함께 보내야 함)
 *
 * 진짜 실시간 스트리밍을 위해 호출을 두 번으로 나눕니다:
 * 1차) 스키마 없이 스트리밍으로 답변 텍스트만 받아 onChunk로 즉시 흘려보냄
 * 2차) 1차 결과에 이어붙여(previous_interaction_id), action/collectedInfo/
 *      recommendations/quickReplies만 구조화된 JSON으로 받음 (텍스트는 재생성하지 않음)
 * 1차가 끝나고 2차를 시작하기 직전에 onMessageComplete를 호출함 — 카드/퀵답변처럼
 * 텍스트 뒤에 더 올 수 있는 내용이 있다는 걸 프론트가 로딩 표시로 미리 알려줄 수 있게 함
 */
export async function getChatDecision(
  {
    message,
    previousInteractionId,
    surveyContext,
    collectedInfo,
    plans,
    promptContent,
    currentPlanCode,
  }: GetChatDecisionParams,
  onChunk: (text: string) => void,
  onMessageComplete: () => void,
  signal?: AbortSignal,
): Promise<ChatDecisionResult> {
  // previous_interaction_id가 없으면 이 사용자와의 첫 메시지라는 뜻 — 모델이 스스로
  // "첫 대화인지"를 판단하다가 인사말을 반복하는 문제가 있어서, 우리가 직접 계산해 알려줌
  const isFirstTurn = !previousInteractionId;
  const messageSystemInstruction = buildSystemPrompt(
    promptContent,
    surveyContext,
    collectedInfo,
    plans,
    isFirstTurn,
    currentPlanCode,
    "message_only",
  );

  // 대화가 새로 시작되는지 이어지는지, collectedInfo가 잘 이어지는지 확인용
  console.log(
    `AI 요청(1차, 스트리밍): previous_interaction_id=${previousInteractionId ?? "(없음, 새 대화)"}, collectedInfo=${JSON.stringify(collectedInfo ?? {})}`,
  );

  let streamResult: StreamInteractionResult;
  try {
    streamResult = await streamInteractionMessage(
      {
        model: env.AI_MODEL,
        input: message,
        previousInteractionId,
        systemInstruction: messageSystemInstruction,
      },
      onChunk,
      signal,
    );
  } catch (err) {
    if (
      axios.isAxiosError(err) &&
      err.response?.status === 404 &&
      previousInteractionId
    ) {
      // 이전 대화(previous_interaction_id)가 보관 기간 만료 등으로 사라졌다면
      // 새 대화로 한 번만 재시도함 (collectedInfo는 우리 쪽에 별도로 남아있어 계속 활용됨)
      console.warn(
        "previous_interaction_id를 찾을 수 없어 새 대화로 재시도합니다.",
      );
      return getChatDecision(
        {
          message,
          surveyContext,
          collectedInfo,
          plans,
          promptContent,
          currentPlanCode,
        },
        onChunk,
        onMessageComplete,
        signal,
      );
    }
    console.error("AI API 스트리밍 호출 에러:", err);
    throw new Error("AI_REQUEST_FAILED");
  }

  onMessageComplete();

  // 2차: 방금 답변을 메타데이터로 정리
  const metadataSystemInstruction = buildChatMetadataPrompt(
    promptContent,
    surveyContext,
    collectedInfo,
    plans,
    currentPlanCode,
  );

  let response;
  try {
    response = await axios({
      method: "post",
      url: "https://generativelanguage.googleapis.com/v1beta/interactions",
      headers: { "x-goog-api-key": env.AI_API_KEY },
      signal,
      data: {
        model: env.AI_MODEL,
        input: "방금 답변을 정리해줘.",
        previous_interaction_id: streamResult.interactionId,
        system_instruction: metadataSystemInstruction,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: RESPONSE_METADATA_SCHEMA,
        },
      },
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      console.error(
        `AI API 호출 에러 (status ${err.response.status}):`,
        JSON.stringify(err.response.data),
      );
    } else {
      console.error("AI API 호출 에러:", err);
    }
    throw new Error("AI_REQUEST_FAILED");
  }

  const interactionId = response.data?.id;
  const steps: InteractionStep[] = response.data?.steps ?? [];
  const modelOutputStep = steps.find((step) => step.type === "model_output");
  const rawText = modelOutputStep?.content?.[0]?.text;

  if (typeof rawText !== "string" || typeof interactionId !== "string") {
    console.error(
      "AI 응답 형식이 예상과 다릅니다:",
      JSON.stringify(response.data),
    );
    throw new Error("AI_RESPONSE_INVALID");
  }

  try {
    const metadata = JSON.parse(rawText) as Omit<ChatDecision, "message">;
    const decision: ChatDecision = { ...metadata, message: streamResult.text };
    return { decision, interactionId };
  } catch {
    console.error("AI 응답 JSON 파싱 실패:", rawText);
    throw new Error("AI_RESPONSE_INVALID");
  }
}

// ─── 요금제 비교 ───────────────────────────────────────────────────────────────

export interface PlanComparisonRow {
  label: string;
  current: string;
  selected: string;
  winner: "current" | "selected" | "tie" | "none";
}

export interface PlanComparisonResult {
  rows: PlanComparisonRow[];
  oneLineSummary: string;
  recommendation: "current" | "selected" | "tie";
  summaryReason: string;
}

const PLAN_COMPARISON_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          current: { type: "string" },
          selected: { type: "string" },
          winner: {
            type: "string",
            enum: ["current", "selected", "tie", "none"],
          },
        },
        required: ["label", "current", "selected", "winner"],
      },
    },
    oneLineSummary: { type: "string" },
    recommendation: { type: "string", enum: ["current", "selected", "tie"] },
    summaryReason: { type: "string" },
  },
  required: ["rows", "oneLineSummary", "recommendation", "summaryReason"],
};

function serializePlan(plan: Record<string, unknown>): string {
  const discountFee = plan["discountFee"] as number | undefined;
  const monthlyFee = plan["monthlyFee"] as number;
  const fee = (discountFee ?? monthlyFee).toLocaleString("ko-KR");

  const benefitDetails =
    (plan["benefitDetails"] as {
      category: string;
      title: string;
      description?: string;
      monthlyValue?: number;
    }[]) ?? [];
  const benefits = benefitDetails
    .map((b) => {
      const val = b.monthlyValue
        ? ` (월 ${b.monthlyValue.toLocaleString("ko-KR")}원 상당)`
        : "";
      const desc = b.description ? `: ${b.description}` : "";
      return `  - [${b.category}] ${b.title}${desc}${val}`;
    })
    .join("\n");

  const choiceBenefits =
    (plan["choiceBenefits"] as {
      stepType?: string;
      title: string;
      options: { title: string }[];
    }[]) ?? [];
  const choices = choiceBenefits
    .filter((c) => c.stepType === "choice")
    .map((c) => {
      const opts = c.options.map((o) => o.title).join(", ");
      return `  - ${c.title} → 선택 가능: ${opts}`;
    })
    .join("\n");

  const perks = (plan["perks"] as string[] | undefined) ?? [];
  const perksStr = perks.length > 0 ? perks.join(", ") : "없음";

  const data =
    (plan["data"] as {
      display: string;
      amountMb?: number | null;
      sharingDisplay?: string;
      familyDataDisplay?: string;
    }) ?? {};

  return [
    `요금제명: ${plan["name"] as string}`,
    `월 요금: ${fee}원`,
    `네트워크: ${plan["network"] as string}`,
    `데이터: ${data.display ?? ""}${data.amountMb === null ? " (무제한)" : ""}`,
    `  - 테더링: ${data.sharingDisplay ?? "없음"}`,
    `  - 가족 데이터: ${data.familyDataDisplay ?? "없음"}`,
    `통화: ${plan["voice"] as string}`,
    `부가통화: ${(plan["additionalVoice"] as string | undefined) ?? "없음"}`,
    `문자: ${plan["sms"] as string}`,
    `멤버십: ${(plan["membershipTier"] as string | undefined) ?? "없음"}`,
    `기본 혜택:\n${benefits || "  없음"}`,
    `선택 혜택:\n${choices || "  없음"}`,
    `부가서비스: ${perksStr}`,
  ].join("\n");
}

export async function comparePlansWithAI(
  currentPlan: Record<string, unknown>,
  selectedPlan: Record<string, unknown>,
): Promise<PlanComparisonResult> {
  const systemInstruction = `당신은 통신 요금제 비교 전문가입니다. 두 요금제를 항목별로 꼼꼼히 비교해서 사용자가 어느 쪽이 더 유리한지 판단할 수 있도록 도와주세요.

[현재 요금제]
${serializePlan(currentPlan)}

[비교 요금제]
${serializePlan(selectedPlan)}

규칙:
- rows에는 월 요금, 네트워크, 데이터, 통화, 부가통화, 문자, 테더링, 가족데이터, 멤버십을 반드시 포함하고, 혜택/부가서비스도 의미있는 차이가 있으면 각각 행으로 추가하세요.
- winner: 해당 항목에서 더 유리한 쪽("current"|"selected"|"tie"|"none"). "none"은 비교 자체가 불가능한 경우에만.
- current/selected는 사람이 읽기 좋은 값 그대로.
- oneLineSummary: 전체를 15자 이내로 요약.
- summaryReason: 최종 추천 이유를 2~3문장으로 설명. 반말 금지, 존댓말로.`;

  let response;
  try {
    response = await axios({
      method: "post",
      url: "https://generativelanguage.googleapis.com/v1beta/interactions",
      headers: { "x-goog-api-key": env.AI_API_KEY },
      data: {
        model: env.AI_MODEL,
        input: "두 요금제를 비교해주세요.",
        system_instruction: systemInstruction,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: PLAN_COMPARISON_SCHEMA,
        },
      },
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      console.error(
        `AI 요금제 비교 에러 (status ${err.response.status}):`,
        JSON.stringify(err.response.data),
      );
    } else {
      console.error("AI 요금제 비교 에러:", err);
    }
    throw new Error("AI_REQUEST_FAILED");
  }

  const steps: InteractionStep[] = response.data?.steps ?? [];
  const modelOutputStep = steps.find((step) => step.type === "model_output");
  const rawText = modelOutputStep?.content?.[0]?.text;

  if (typeof rawText !== "string") {
    console.error(
      "AI 비교 응답 형식이 예상과 다릅니다:",
      JSON.stringify(response.data),
    );
    throw new Error("AI_RESPONSE_INVALID");
  }

  try {
    return JSON.parse(rawText) as PlanComparisonResult;
  } catch {
    console.error("AI 비교 응답 JSON 파싱 실패:", rawText);
    throw new Error("AI_RESPONSE_INVALID");
  }
}

export interface UsageRecommendationCandidate {
  code: string;
  name: string;
  monthlyFee: number;
  dataDisplay: string;
  tags: string[];
}

export interface UsageRecommendationDecision {
  selectedCode: string;
  headline: string;
  reason: string;
}

const USAGE_RECOMMENDATION_SCHEMA = {
  type: "object",
  properties: {
    selectedCode: { type: "string" },
    headline: { type: "string" },
    reason: { type: "string" },
  },
  required: ["selectedCode", "headline", "reason"],
};

export async function recommendPlanFromUsageWithAI(input: {
  currentPlanName: string;
  currentMonthlyFee: number;
  recentAverageGb: number;
  previousAverageGb: number;
  changeRate: number;
  activeOttCount: number;
  candidates: UsageRecommendationCandidate[];
}): Promise<UsageRecommendationDecision> {
  const candidates = input.candidates
    .map(
      (plan) =>
        `- ${plan.code}: ${plan.name}, 월 ${plan.monthlyFee}원, 데이터 ${plan.dataDisplay}, 태그 ${plan.tags.join(", ") || "없음"}`,
    )
    .join("\n");
  const systemInstruction = `당신은 통신 요금제 사용 패턴 분석가입니다.
현재 요금제: ${input.currentPlanName}, 월 ${input.currentMonthlyFee}원
이전 3개월 평균: ${input.previousAverageGb}GB
최근 3개월 평균: ${input.recentAverageGb}GB
변화율: ${input.changeRate}%
활성 OTT 구독: ${input.activeOttCount}개

[서버가 검증한 추천 가능 후보]
${candidates}

규칙:
- selectedCode는 반드시 위 후보 코드 중 하나만 선택하세요.
- 사용량 감소와 구독 변화를 함께 고려하세요.
- headline은 25자 이내, reason은 존댓말 2문장 이내로 작성하세요.
- 절약 금액을 임의로 쓰지 마세요. 금액은 서버가 계산합니다.`;

  const response = await axios({
    method: "post",
    url: "https://generativelanguage.googleapis.com/v1beta/interactions",
    headers: { "x-goog-api-key": env.AI_API_KEY },
    data: {
      model: env.AI_MODEL,
      input: "최근 사용 패턴에 맞는 요금제를 추천해주세요.",
      system_instruction: systemInstruction,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: USAGE_RECOMMENDATION_SCHEMA,
      },
    },
  });
  const steps: InteractionStep[] = response.data?.steps ?? [];
  const rawText = steps.find((step) => step.type === "model_output")
    ?.content?.[0]?.text;
  if (typeof rawText !== "string") throw new Error("AI_RESPONSE_INVALID");
  return JSON.parse(rawText) as UsageRecommendationDecision;
}

// ─── 가입 플로우 AI 결정 ────────────────────────────────────────────────────────

const SIGNUP_DATA_SCHEMA = {
  type: "object",
  properties: {
    fraudWarningAcknowledged: { type: "boolean" },
    agreedToTerms: { type: "boolean" },
    identityVerified: { type: "boolean" },
    phoneNumber: { type: "string" },
    name: { type: "string" },
    birth: { type: "string" },
    selectedBenefits: { type: "object" },
    paymentMethod: {
      type: "string",
      enum: ["계좌이체", "신용카드", "카카오페이", "네이버페이", "토스"],
    },
  },
};

// 2차(메타데이터 전용) 호출용 — message 필드는 1차 스트리밍에서 이미 확보했으므로 뺌
const SIGNUP_METADATA_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["signup"] },
    signupStep: {
      type: "string",
      enum: [
        "fraud_warning",
        "terms_agreement",
        "identity_verification",
        "collect_info",
        "select_benefits",
        "select_payment",
        "final_confirm",
        "completed",
      ],
    },
    signupData: SIGNUP_DATA_SCHEMA,
    quickReplies: { type: "array", items: { type: "string" } },
  },
  required: ["action", "signupStep", "signupData"],
};

interface GetSignupDecisionParams {
  message: string;
  previousInteractionId?: string;
  promptContent: string;
  preselectedPlan: { code: string; name: string; monthlyFee: number };
  signupCollectedData?: Record<string, unknown>;
  choiceBenefits?: Array<{
    code: string;
    title: string;
    selectionCount: number;
    required: boolean;
    options: Array<{ code: string; title: string; description: string | null }>;
  }>;
}

/**
 * 가입 플로우 전용 AI 결정 함수.
 * 추천 플로우의 getChatDecision과 별도로 분리해 프롬프트·스키마가 섞이지 않게 합니다.
 *
 * 진짜 실시간 스트리밍을 위해 getChatDecision과 같은 방식으로 호출을 두 번으로 나눕니다:
 * 1차) 스키마 없이 스트리밍으로 답변 텍스트만 받아 onChunk로 즉시 흘려보냄
 * 2차) 1차 결과에 이어붙여(previous_interaction_id), signupStep/signupData/
 *      quickReplies만 구조화된 JSON으로 받음 (텍스트는 재생성하지 않음)
 * 1차가 끝나고 2차를 시작하기 직전에 onMessageComplete를 호출함 — 카드/퀵답변처럼
 * 텍스트 뒤에 더 올 수 있는 내용이 있다는 걸 프론트가 로딩 표시로 미리 알려줄 수 있게 함
 */
export async function getSignupDecision(
  {
    message,
    previousInteractionId,
    promptContent,
    preselectedPlan,
    signupCollectedData,
    choiceBenefits = [],
  }: GetSignupDecisionParams,
  onChunk: (text: string) => void,
  onMessageComplete: () => void,
  signal?: AbortSignal,
): Promise<ChatDecisionResult> {
  const choiceBenefitsBlock = formatChoiceBenefitsForSignup(choiceBenefits);
  const messageSystemInstruction = buildSignupSystemPrompt(
    promptContent,
    preselectedPlan,
    signupCollectedData,
    choiceBenefitsBlock,
    "message_only",
  );

  console.log(
    `[가입 AI] 1차(스트리밍) previous_interaction_id=${previousInteractionId ?? "(없음)"}`,
  );

  let streamResult: StreamInteractionResult;
  try {
    streamResult = await streamInteractionMessage(
      {
        model: env.AI_MODEL,
        input: message,
        previousInteractionId,
        systemInstruction: messageSystemInstruction,
      },
      onChunk,
      signal,
    );
  } catch (err) {
    if (
      axios.isAxiosError(err) &&
      err.response?.status === 404 &&
      previousInteractionId
    ) {
      console.warn("[가입 AI] previous_interaction_id 만료, 새 대화로 재시도");
      return getSignupDecision(
        {
          message,
          promptContent,
          preselectedPlan,
          signupCollectedData,
          choiceBenefits,
        },
        onChunk,
        onMessageComplete,
        signal,
      );
    }
    console.error("[가입 AI] 1차(스트리밍) 에러:", err);
    throw new Error("AI_REQUEST_FAILED");
  }

  onMessageComplete();

  // 2차: 방금 답변을 메타데이터로 정리
  const metadataSystemInstruction = buildSignupMetadataPrompt(
    promptContent,
    preselectedPlan,
    signupCollectedData,
    choiceBenefitsBlock,
  );

  let response;
  try {
    response = await axios({
      method: "post",
      url: "https://generativelanguage.googleapis.com/v1beta/interactions",
      headers: { "x-goog-api-key": env.AI_API_KEY },
      signal,
      data: {
        model: env.AI_MODEL,
        input: "방금 답변을 정리해줘.",
        previous_interaction_id: streamResult.interactionId,
        system_instruction: metadataSystemInstruction,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: SIGNUP_METADATA_SCHEMA,
        },
      },
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      console.error(
        `[가입 AI] 2차(메타데이터) 에러 (status ${err.response.status}):`,
        JSON.stringify(err.response.data),
      );
    } else {
      console.error("[가입 AI] 2차(메타데이터) 에러:", err);
    }
    throw new Error("AI_REQUEST_FAILED");
  }

  const interactionId = response.data?.id;
  const steps: InteractionStep[] = response.data?.steps ?? [];
  const modelOutputStep = steps.find((step) => step.type === "model_output");
  const rawText = modelOutputStep?.content?.[0]?.text;

  if (typeof rawText !== "string" || typeof interactionId !== "string") {
    console.error("[가입 AI] 응답 형식 오류:", JSON.stringify(response.data));
    throw new Error("AI_RESPONSE_INVALID");
  }

  try {
    const metadata = JSON.parse(rawText) as Omit<ChatDecision, "message">;
    const decision: ChatDecision = { ...metadata, message: streamResult.text };
    return { decision, interactionId };
  } catch {
    console.error("[가입 AI] JSON 파싱 실패:", rawText);
    throw new Error("AI_RESPONSE_INVALID");
  }
}
