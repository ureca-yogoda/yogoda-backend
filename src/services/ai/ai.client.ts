import axios from "axios";
import { env } from "../../core/config/env.js";
import {
  AI_META_DELIMITER,
  buildSystemPrompt,
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

/*
 * AxiosError를 console.error에 그대로 넘기면 내부 request/response 객체(소켓, 스트림 등
 * 순환 참조가 있는 Node 내부 구조까지) 전체가 터미널에 통째로 찍혀 로그가 감당 안 되게
 * 길어짐. 상태 코드와 메시지만 뽑아서 짧게 출력함
 */
function logAiError(label: string, err: unknown): void {
  if (axios.isAxiosError(err)) {
    console.error(
      `${label} (status ${err.response?.status ?? "?"}): ${err.message}`,
    );
    return;
  }
  console.error(label, err);
}

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

/*
 * streamInteractionMessage의 onChunk를 감싸서, AI_META_DELIMITER 이후(판단용 JSON
 * 구간)는 절대 화면으로 흘려보내지 않게 막음. 델리미터가 여러 델타에 걸쳐 쪼개져
 * 도착해도 놓치지 않도록, 델리미터 길이-1만큼은 항상 보류했다가 다음 델타와
 * 합쳐서 확인함 (한 번에 다 안 왔을 수 있는 마지막 몇 글자를 섣불리 흘려보내지 않음)
 */
function createDelimiterFilteredOnChunk(onChunk: (text: string) => void) {
  let pending = "";
  let metaStarted = false;

  return (raw: string) => {
    if (metaStarted) return;
    pending += raw;

    const idx = pending.indexOf(AI_META_DELIMITER);
    if (idx !== -1) {
      const visible = pending.slice(0, idx);
      if (visible) onChunk(visible);
      metaStarted = true;
      pending = "";
      return;
    }

    const safeLen = Math.max(
      0,
      pending.length - (AI_META_DELIMITER.length - 1),
    );
    if (safeLen > 0) {
      onChunk(pending.slice(0, safeLen));
      pending = pending.slice(safeLen);
    }
  };
}

/*
 * 가입 플로우의 message_only 호출은 "내부 상태/필드 이름을 절대 언급하지 말라"고
 * 프롬프트로 명시했는데도, 모델이 이따금 그걸 어김. 두 가지 형태로 확인됨:
 * 1) { "action": "signup", ... } 같은 메타데이터 JSON을 답변 뒤에 그대로 이어붙임
 * 2) "[이미 파악된 정보]\n- signupStep: ..." 처럼 자기 시스템 프롬프트의 섹션 형식을
 *    흉내 내어 내부 상태를 그대로 요약해 붙임
 * 실제 signupStep/signupData 판단은 어차피 이 텍스트가 아니라 별도 2차 메타데이터
 * 호출로 하므로, 이건 화면에 노출되기만 하는 순수 부작용임. 아래 마커 중 하나라도
 * 보이면 그 지점부터는 화면으로도, 최종 저장될 텍스트로도 포함하지 않음
 */
const SIGNUP_LEAK_MARKERS = [
  "signupStep",
  "signupData",
  "quickReplies",
  "collectedInfo",
  "fraudWarningAcknowledged",
  "identityVerified",
  '"action"',
  "[이미 파악된 정보]",
  "[가입 진행 정보]",
];
const SIGNUP_LEAK_MAX_MARKER_LEN = Math.max(
  ...SIGNUP_LEAK_MARKERS.map((m) => m.length),
);

function createSignupLeakFilteredOnChunk(onChunk: (text: string) => void) {
  let pending = "";
  let clean = "";
  let suppressed = false;

  function earliestMarkerIndex(text: string): number {
    let earliest = -1;
    for (const marker of SIGNUP_LEAK_MARKERS) {
      const idx = text.indexOf(marker);
      if (idx !== -1 && (earliest === -1 || idx < earliest)) earliest = idx;
    }
    return earliest;
  }

  function tryFlush(isFinal: boolean) {
    if (suppressed) return;

    const markerIdx = earliestMarkerIndex(pending);
    if (markerIdx !== -1) {
      const before = pending.slice(0, markerIdx);
      if (before) {
        clean += before;
        onChunk(before);
      }
      suppressed = true;
      pending = "";
      return;
    }

    // 마커가 아직 안 보이면, 마커 일부가 다음 델타에 걸쳐 들어올 수 있는 꼬리
    // (가장 긴 마커 길이-1만큼)만 남기고 나머지는 안전하게 흘려보냄. 스트림이
    // 끝났다면(더 올 데이터가 없음) 남은 걸 전부 흘려보냄
    const safeLen = isFinal
      ? pending.length
      : Math.max(0, pending.length - (SIGNUP_LEAK_MAX_MARKER_LEN - 1));
    if (safeLen > 0) {
      const toForward = pending.slice(0, safeLen);
      clean += toForward;
      onChunk(toForward);
      pending = pending.slice(safeLen);
    }
  }

  return {
    onChunk: (raw: string) => {
      if (suppressed) return;
      pending += raw;
      tryFlush(false);
    },
    // 스트림 종료 후 호출. 화면에 이미 나간 텍스트와 항상 같은 값을 반환해서
    // DB 저장/재접속 시 복원 텍스트가 어긋나지 않게 함
    finish: (): string => {
      tryFlush(true);
      return clean;
    },
  };
}

/*
 * recommendations[].reason 값이 **볼드**로 시작할 때, 모델이 여는 큰따옴표를
 * 빠뜨리는 경우가 실제로 확인됨 (예: "reason": **텍스트**... — 닫는 따옴표는
 * 정상적으로 붙어있어서, 여는 따옴표만 보정하면 유효한 JSON이 됨).
 * ": **" 형태(필드 값이 따옴표 없이 곧장 **로 시작하는 자리)를 찾아 그 앞에
 * 여는 큰따옴표를 넣어줌. 이미 정상인 ": "**..." 형태는 콜론과 **사이에 큰따옴표가
 * 있어서 이 패턴에 안 걸림
 */
function repairUnquotedBoldValue(raw: string): string {
  return raw.replace(/(:\s*)(\*\*)/g, '$1"$2');
}

/*
 * 스트림이 끝난 뒤, 누적된 전체 텍스트를 AI_META_DELIMITER 기준으로 답변/메타데이터로
 * 나눔. 델리미터를 못 찾거나 JSON 파싱에 실패해도 답변 텍스트 자체는 이미 스트리밍이
 * 끝난 유효한 값이므로, 메타데이터만 안전한 기본값으로 채워서 턴 전체를 실패시키지 않음
 */
function splitMessageAndMetadata(
  fullText: string,
  label: string,
): { message: string; metadata: Omit<ChatDecision, "message"> } {
  const idx = fullText.indexOf(AI_META_DELIMITER);
  const fallback: Omit<ChatDecision, "message"> = {
    action: "ask",
    quickReplies: [],
  };

  if (idx === -1) {
    console.warn(`${label} 응답에서 메타데이터 구분자를 찾지 못했습니다.`);
    return { message: fullText.trim(), metadata: fallback };
  }

  const message = fullText.slice(0, idx).trim();
  const metaRaw = fullText
    .slice(idx + AI_META_DELIMITER.length)
    .replace(/^```json\s*|```\s*$/g, "")
    .trim();

  try {
    const metadata = JSON.parse(metaRaw) as Omit<ChatDecision, "message">;
    return { message, metadata };
  } catch {
    // 흔한 형식 실수(여는 따옴표 누락) 한 가지만 보정해서 한 번 더 시도함
    try {
      const repaired = repairUnquotedBoldValue(metaRaw);
      const metadata = JSON.parse(repaired) as Omit<ChatDecision, "message">;
      console.warn(
        `${label} 메타데이터 JSON 보정 후 파싱 성공 (여는 따옴표 누락)`,
      );
      return { message, metadata };
    } catch {
      console.error(`${label} 메타데이터 JSON 파싱 실패:`, metaRaw);
      return { message, metadata: fallback };
    }
  }
}

/**
 * Gemini Interactions API로 대화를 이어갑니다.
 * generateContent와 달리 대화 전체를 매번 다시 보내지 않고, previous_interaction_id만
 * 넘기면 구글 서버가 이전 대화 맥락을 자동으로 이어붙여줍니다.
 *
 * 스트리밍 한 번의 호출로 답변 텍스트와 판단용 메타데이터(action/collectedInfo/
 * recommendations/quickReplies)를 함께 받습니다. 모델이 AI_META_DELIMITER를 기준으로
 * 두 부분을 이어서 출력하도록 프롬프트로 지시하고, 델리미터 이후는 화면에 흘려보내지
 * 않은 채 모아뒀다가 스트림이 끝난 뒤 JSON으로 파싱합니다. (스트리밍 + 구조화된 스키마
 * 동시 사용은 공식적으로 보장되지 않아, 스키마 강제 대신 이 방식을 씀 — 호출이 한
 * 번뿐이라 빠르지만, 모델이 형식을 어기면 메타데이터는 기본값으로 처리됩니다.)
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
  const systemInstruction = buildSystemPrompt(
    promptContent,
    surveyContext,
    collectedInfo,
    plans,
    isFirstTurn,
    currentPlanCode,
  );

  // 대화가 새로 시작되는지 이어지는지, collectedInfo가 잘 이어지는지 확인용
  console.log(
    `AI 요청(스트리밍): previous_interaction_id=${previousInteractionId ?? "(없음, 새 대화)"}, collectedInfo=${JSON.stringify(collectedInfo ?? {})}`,
  );

  let streamResult: StreamInteractionResult;
  try {
    streamResult = await streamInteractionMessage(
      {
        model: env.AI_MODEL,
        input: message,
        previousInteractionId,
        systemInstruction,
      },
      createDelimiterFilteredOnChunk(onChunk),
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
    logAiError("AI API 스트리밍 호출 에러", err);
    throw new Error("AI_REQUEST_FAILED");
  }

  onMessageComplete();

  const { message: parsedMessage, metadata } = splitMessageAndMetadata(
    streamResult.text,
    "AI 채팅",
  );
  const decision: ChatDecision = { ...metadata, message: parsedMessage };

  return { decision, interactionId: streamResult.interactionId };
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
      logAiError("AI 요금제 비교 에러", err);
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

  const leakFilter = createSignupLeakFilteredOnChunk(onChunk);

  let streamResult: StreamInteractionResult;
  try {
    streamResult = await streamInteractionMessage(
      {
        model: env.AI_MODEL,
        input: message,
        previousInteractionId,
        systemInstruction: messageSystemInstruction,
      },
      leakFilter.onChunk,
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
    logAiError("[가입 AI] 1차(스트리밍) 에러", err);
    throw new Error("AI_REQUEST_FAILED");
  }

  // 화면에 이미 흘려보낸 텍스트와 항상 같은 값이 되도록, 누출된 부분을 뺀
  // 정리된 텍스트를 사용함 (streamResult.text는 누출된 내용까지 그대로 들어있음)
  const cleanMessage = leakFilter.finish();

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
      logAiError("[가입 AI] 2차(메타데이터) 에러", err);
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
    const decision: ChatDecision = { ...metadata, message: cleanMessage };
    return { decision, interactionId };
  } catch {
    console.error("[가입 AI] JSON 파싱 실패:", rawText);
    throw new Error("AI_RESPONSE_INVALID");
  }
}
