import axios from "axios";
import { env } from "../../core/config/env.js";
import { buildSystemPrompt } from "./ai.prompt.js";
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
}: GetChatDecisionParams): Promise<ChatDecisionResult> {
  // previous_interaction_id가 없으면 이 사용자와의 첫 메시지라는 뜻 — 모델이 스스로
  // "첫 대화인지"를 판단하다가 인사말을 반복하는 문제가 있어서, 우리가 직접 계산해 알려줌
  const isFirstTurn = !previousInteractionId;
  const systemInstruction = buildSystemPrompt(
    surveyContext,
    collectedInfo,
    plans,
    isFirstTurn,
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
