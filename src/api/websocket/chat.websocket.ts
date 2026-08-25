import { Server, Socket } from "socket.io";

import { env } from "../../core/config/env.js";
import { verifyToken } from "../../core/security/jwt.js";
import type { ChatSessionFunnelStage } from "../../models/chat-session.model.js";
import type {
  UiEventAction,
  UiEventElement,
} from "../../models/ui-event.model.js";
import { getChatDecision } from "../../services/ai/ai.client.js";
import {
  recordConversionEvent,
  resolveChatSession,
  saveMessage,
  updateCollectedInfo,
  updateLastInteractionId,
} from "../../services/chat-history.service.js";
import { getCurrentPlan } from "../../services/plan.service.js";
import { getPromptContentByVersion } from "../../services/prompt.service.js";
import {
  buildPlanCards,
  getPlanCandidates,
} from "../../services/plan-recommendation.service.js";
import { recordUiEvent } from "../../services/ui-event.service.js";
import type { SurveyAnswers, SurveyContext } from "../../types/chat.js";

const TYPE_CHUNK_SIZE = 8;
const TYPE_CHUNK_DELAY_MS = 30;

interface ChatMessagePayload {
  message?: string;
  simulateError?: boolean;
  surveyContext?: SurveyContext;
}

interface ChatSocketAuth {
  token?: string;
  sessionId?: string;
}

interface ConversionEventPayload {
  sessionId?: string;
  event?: string;
}

const FUNNEL_STAGES: ChatSessionFunnelStage[] = [
  "consultation_started",
  "recommendation_completed",
  "plan_comparison_viewed",
  "signup_started",
  "signup_completed",
];

function isFunnelStage(value: unknown): value is ChatSessionFunnelStage {
  return (
    typeof value === "string" && (FUNNEL_STAGES as string[]).includes(value)
  );
}

interface UiEventPayload {
  sessionId?: string;
  element?: string;
  action?: string;
}

const UI_EVENT_ELEMENTS: UiEventElement[] = [
  "plan_detail",
  "plan_comparison",
  "signup_button",
  "benefit_detail",
  "agent_connect",
];

const UI_EVENT_ACTIONS: UiEventAction[] = ["view", "click"];

function isUiEventElement(value: unknown): value is UiEventElement {
  return (
    typeof value === "string" && (UI_EVENT_ELEMENTS as string[]).includes(value)
  );
}

function isUiEventAction(value: unknown): value is UiEventAction {
  return (
    typeof value === "string" && (UI_EVENT_ACTIONS as string[]).includes(value)
  );
}

// AI 응답을 실제로 스트리밍 받지 않아도, 조각내서 순차 전송해 타자기 효과가 자연스럽게 이어지도록 함
async function sendTypedText(socket: Socket, text: string) {
  for (let i = 0; i < text.length; i += TYPE_CHUNK_SIZE) {
    socket.emit("chunk", text.slice(i, i + TYPE_CHUNK_SIZE));
    await new Promise((resolve) => setTimeout(resolve, TYPE_CHUNK_DELAY_MS));
  }
}

/**
 * 소켓 연결에 실려온 토큰을 검증해 로그인한 유저 id를 반환합니다.
 * 토큰이 없거나 유효하지 않으면 null을 반환해 비회원으로 처리합니다.
 */
function resolveConnectionUserId(token: string | undefined): string | null {
  if (!token) return null;

  try {
    const payload = verifyToken(token);
    return (payload.userId as string | undefined) ?? null;
  } catch (err) {
    console.error("소켓 토큰 검증 실패, 비회원으로 처리합니다:", err);
    return null;
  }
}

/**
 * AI 채팅 소켓 네임스페이스를 셋업합니다.
 */
export function setupChatSocket(io: Server) {
  const chatNamespace = io.of("/chat");

  chatNamespace.on("connection", (socket: Socket) => {
    console.log("🔌 새로운 소켓 연결 성공");

    const { token, sessionId } = socket.handshake.auth as ChatSocketAuth;
    const userId = resolveConnectionUserId(token);

    let currentSessionId: string;
    let promptContent: string;
    let collectedInfo: SurveyAnswers | undefined;
    let previousInteractionId: string | undefined;

    /*
     * connection 핸들러 자체를 async로 만들면 이 구간이 끝나기 전까지
     * 아래 socket.on("message", ...) 리스너가 등록되지 않아, 그 사이에 클라이언트가
     * 보낸 이벤트를 통째로 놓칠 수 있음. 그래서 리스너는 동기적으로 먼저 등록해두고,
     * 각 핸들러 안에서 이 Promise를 await해서 세션이 준비될 때까지만 대기함
     */
    const sessionReady = (async () => {
      const { session } = await resolveChatSession(userId, sessionId);

      currentSessionId = session._id.toString();
      promptContent = await getPromptContentByVersion(session.prompt_version);
      console.log(
        `📝 세션 ${currentSessionId} 프롬프트 버전: ${session.prompt_version ?? "(없음, 기본값 사용)"}`,
      );
      collectedInfo =
        (session.collected_info as SurveyAnswers | null) ?? undefined;
      previousInteractionId = session.last_interaction_id ?? undefined;

      socket.emit("session_created", {
        sessionId: currentSessionId,
        promptVersion: session.prompt_version,
      });
    })();

    socket.on("message", async (payload: ChatMessagePayload) => {
      const { message, simulateError, surveyContext } = payload;

      if (!message || message.trim() === "") {
        socket.emit("error", "메시지가 유효하지 않습니다.");
        return;
      }

      // 1. 강제 에러 시뮬레이션
      if (simulateError) {
        socket.emit("error", "시뮬레이션 에러가 발생했습니다.");
        socket.disconnect();
        return;
      }

      // 2. AI API 키 검증
      if (!env.AI_API_KEY) {
        socket.emit("error", "AI API 키가 등록되지 않았습니다.");
        socket.disconnect();
        return;
      }

      // 3. AI 모델명 검증
      if (!env.AI_MODEL) {
        socket.emit("error", "AI 모델이 설정되지 않았습니다.");
        socket.disconnect();
        return;
      }

      try {
        await sessionReady;

        await saveMessage(currentSessionId, "user", message);

        // 로그인 사용자가 이미 이용 중인 요금제가 있다면, AI가 같은 요금제를
        // 다시 추천하지 않도록 후보 목록에서 미리 제외함
        const currentPlan = userId ? await getCurrentPlan(userId) : null;
        const candidates = await getPlanCandidates(currentPlan?.planCode);

        const { decision, interactionId } = await getChatDecision({
          message,
          previousInteractionId,
          surveyContext,
          collectedInfo,
          plans: candidates,
          promptContent,
        });

        // 요금제를 추천하는 응답이면, 텍스트 메시지를 저장할 때 카드도 함께 저장해서
        // 재접속 시 getSessionMessages()로 그대로 복원되게 함
        let cards: ReturnType<typeof buildPlanCards> = [];
        if (
          decision.action === "recommend" &&
          decision.recommendations?.length
        ) {
          cards = buildPlanCards(decision.recommendations, candidates);
        }

        await saveMessage(
          currentSessionId,
          "admin",
          decision.message,
          cards.length > 0 ? cards : undefined,
        );

        if (decision.collectedInfo) {
          await updateCollectedInfo(currentSessionId, decision.collectedInfo);
          collectedInfo = decision.collectedInfo;
        }

        await updateLastInteractionId(currentSessionId, interactionId);
        previousInteractionId = interactionId;

        socket.emit("interaction", { interactionId });
        if (decision.collectedInfo) {
          socket.emit("info", decision.collectedInfo);
        }

        await sendTypedText(socket, decision.message);

        if (cards.length > 0) {
          socket.emit("plans", cards);
        }

        // 질문(action: ask)에만 빠른 답변 후보를 보여줌 — 추천 결과에는 의미가 없음
        if (decision.action === "ask" && decision.quickReplies?.length) {
          socket.emit("quickReplies", decision.quickReplies);
        }

        socket.emit("done");
      } catch (aiError) {
        console.error("AI 채팅 처리 에러:", aiError);
        socket.emit("error", "AI 서버 연결에 실패했습니다.");
      }
    });

    socket.on("conversion_event", async (payload: ConversionEventPayload) => {
      if (!isFunnelStage(payload.event)) return;

      try {
        await sessionReady;
        await recordConversionEvent(currentSessionId, payload.event);
      } catch (err) {
        console.error("전환 이벤트 처리 에러:", err);
      }
    });

    socket.on("ui_event", async (payload: UiEventPayload) => {
      if (
        !isUiEventElement(payload.element) ||
        !isUiEventAction(payload.action)
      ) {
        return;
      }

      try {
        await sessionReady;
        await recordUiEvent(currentSessionId, payload.element, payload.action);
      } catch (err) {
        console.error("UI 이벤트 처리 에러:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log("🔌 소켓 연결 종료");
    });
  });
}
