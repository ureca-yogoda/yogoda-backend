import axios from "axios";
import { env } from "../../core/config/env.js";
import {
  buildSystemPrompt,
  buildSignupSystemPrompt,
  formatChoiceBenefitsForSignup,
} from "./ai.prompt.js";
import type {
  ChatDecision,
  PlanCandidate,
  SurveyAnswers,
  SurveyContext,
} from "../../types/chat.js";
import type { IPlan } from "../../models/plan.model.js";

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

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["ask", "recommend"] },
    message: { type: "string" },
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
  required: ["action", "message"],
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

/**
 * Gemini Interactions API로 대화를 이어갑니다.
 * generateContent와 달리 대화 전체를 매번 다시 보내지 않고, previous_interaction_id만
 * 넘기면 구글 서버가 이전 대화 맥락을 자동으로 이어붙여줍니다.
 * (system_instruction/response_format은 "이번 턴 한정" 값이라 매번 새로 만들어서 함께 보내야 함)
 */
export async function getChatDecision({
  message,
  previousInteractionId,
  surveyContext,
  collectedInfo,
  plans,
  promptContent,
  currentPlanCode,
}: GetChatDecisionParams): Promise<ChatDecisionResult> {
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
    `AI 요청: previous_interaction_id=${previousInteractionId ?? "(없음, 새 대화)"}, collectedInfo=${JSON.stringify(collectedInfo ?? {})}`,
  );

  let response;

  try {
    response = await axios({
      method: "post",
      url: "https://generativelanguage.googleapis.com/v1beta/interactions",
      headers: { "x-goog-api-key": env.AI_API_KEY },
      data: {
        model: env.AI_MODEL,
        input: message,
        ...(previousInteractionId
          ? { previous_interaction_id: previousInteractionId }
          : {}),
        system_instruction: systemInstruction,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: RESPONSE_SCHEMA,
        },
      },
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      console.error(
        `AI API 호출 에러 (status ${err.response.status}):`,
        JSON.stringify(err.response.data),
      );

      // 이전 대화(previous_interaction_id)가 보관 기간 만료 등으로 사라졌다면
      // 새 대화로 한 번만 재시도함 (collectedInfo는 우리 쪽에 별도로 남아있어 계속 활용됨)
      if (previousInteractionId && err.response.status === 404) {
        console.warn(
          "previous_interaction_id를 찾을 수 없어 새 대화로 재시도합니다.",
        );
        return getChatDecision({
          message,
          surveyContext,
          collectedInfo,
          plans,
          promptContent,
        });
      }
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
    const decision = JSON.parse(rawText) as ChatDecision;
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

function serializePlan(plan: IPlan): string {
  const fee = (plan.discount_fee ?? plan.monthly_fee).toLocaleString("ko-KR");

  const benefits = plan.benefit_details
    .map((b) => {
      const val = b.monthly_value
        ? ` (월 ${b.monthly_value.toLocaleString("ko-KR")}원 상당)`
        : "";
      const desc = b.description ? `: ${b.description}` : "";
      return `  - [${b.category}] ${b.title}${desc}${val}`;
    })
    .join("\n");

  const choices = plan.choice_benefits
    .filter((c) => c.step_type === "choice")
    .map((c) => {
      const opts = c.options.map((o) => o.title).join(", ");
      return `  - ${c.title} → 선택 가능: ${opts}`;
    })
    .join("\n");

  const perks = plan.perks.length > 0 ? plan.perks.join(", ") : "없음";

  return [
    `요금제명: ${plan.name}`,
    `월 요금: ${fee}원`,
    `네트워크: ${plan.network}`,
    `데이터: ${plan.data.display}${plan.data.amount_mb === null ? " (무제한)" : ""}`,
    `  - 테더링: ${plan.data.sharing_display ?? "없음"}`,
    `  - 가족 데이터: ${plan.data.family_data_display ?? "없음"}`,
    `통화: ${plan.voice}`,
    `부가통화: ${plan.additional_voice ?? "없음"}`,
    `문자: ${plan.sms}`,
    `멤버십: ${plan.membership_tier ?? "없음"}`,
    `기본 혜택:\n${benefits || "  없음"}`,
    `선택 혜택:\n${choices || "  없음"}`,
    `부가서비스: ${perks}`,
  ].join("\n");
}

export async function comparePlansWithAI(
  currentPlan: IPlan,
  selectedPlan: IPlan,
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

// ─── 가입 플로우 AI 결정 ────────────────────────────────────────────────────────

const SIGNUP_DATA_SCHEMA = {
  type: "object",
  properties: {
    signupType: { type: "string", enum: ["신규가입", "번호이동"] },
    fraudWarningAcknowledged: { type: "boolean" },
    agreedToTerms: { type: "boolean" },
    name: { type: "string" },
    birth: { type: "string" },
    selectedBenefits: { type: "object" },
    paymentMethod: {
      type: "string",
      enum: ["계좌이체", "신용카드", "카카오페이", "네이버페이", "토스"],
    },
  },
};

const SIGNUP_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["signup"] },
    signupStep: {
      type: "string",
      enum: [
        "confirm_plan",
        "fraud_warning",
        "terms_agreement",
        "collect_info",
        "select_benefits",
        "select_payment",
        "final_confirm",
        "completed",
      ],
    },
    message: { type: "string" },
    signupData: SIGNUP_DATA_SCHEMA,
    quickReplies: { type: "array", items: { type: "string" } },
  },
  required: ["action", "signupStep", "message", "signupData"],
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
 */
export async function getSignupDecision({
  message,
  previousInteractionId,
  promptContent,
  preselectedPlan,
  signupCollectedData,
  choiceBenefits = [],
}: GetSignupDecisionParams): Promise<ChatDecisionResult> {
  const choiceBenefitsBlock = formatChoiceBenefitsForSignup(choiceBenefits);
  const systemInstruction = buildSignupSystemPrompt(
    promptContent,
    preselectedPlan,
    signupCollectedData,
    choiceBenefitsBlock,
  );

  console.log(
    `[가입 AI] previous_interaction_id=${previousInteractionId ?? "(없음)"}, step=${signupCollectedData?.signupStep ?? "시작"}`,
  );

  let response;
  try {
    response = await axios({
      method: "post",
      url: "https://generativelanguage.googleapis.com/v1beta/interactions",
      headers: { "x-goog-api-key": env.AI_API_KEY },
      data: {
        model: env.AI_MODEL,
        input: message,
        ...(previousInteractionId
          ? { previous_interaction_id: previousInteractionId }
          : {}),
        system_instruction: systemInstruction,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: SIGNUP_RESPONSE_SCHEMA,
        },
      },
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      console.error(
        `[가입 AI] 에러 (status ${err.response.status}):`,
        JSON.stringify(err.response.data),
      );
      if (previousInteractionId && err.response.status === 404) {
        console.warn(
          "[가입 AI] previous_interaction_id 만료, 새 대화로 재시도",
        );
        return getSignupDecision({
          message,
          promptContent,
          preselectedPlan,
          signupCollectedData,
          choiceBenefits,
        });
      }
    } else {
      console.error("[가입 AI] 에러:", err);
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
    const decision = JSON.parse(rawText) as ChatDecision;
    return { decision, interactionId };
  } catch {
    console.error("[가입 AI] JSON 파싱 실패:", rawText);
    throw new Error("AI_RESPONSE_INVALID");
  }
}
