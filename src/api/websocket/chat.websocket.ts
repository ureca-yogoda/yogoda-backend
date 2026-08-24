import { Server, Socket } from "socket.io";

import { env } from "../../core/config/env.js";
import { verifyToken } from "../../core/security/jwt.js";
import { getChatDecision } from "../../services/ai/ai.client.js";
import {
  getOrCreateAIChatSession,
  saveMessage,
  updateCollectedInfo,
  updateLastInteractionId,
} from "../../services/chat-history.service.js";
import {
  buildPlanCards,
  getPlanCandidates,
} from "../../services/plan-recommendation.service.js";
import type { SurveyAnswers, SurveyContext } from "../../types/chat.js";

const TYPE_CHUNK_SIZE = 8;
const TYPE_CHUNK_DELAY_MS = 30;

interface ChatMessagePayload {
  message?: string;
  simulateError?: boolean;
  surveyContext?: SurveyContext;
  collectedInfo?: SurveyAnswers;
  previousInteractionId?: string;
  token?: string;
  sessionId?: string;
}

// AI 응답을 실제로 스트리밍 받지 않아도, 조각내서 순차 전송해 타자기 효과가 자연스럽게 이어지도록 함
async function sendTypedText(socket: Socket, text: string) {
  for (let i = 0; i < text.length; i += TYPE_CHUNK_SIZE) {
    socket.emit("chunk", text.slice(i, i + TYPE_CHUNK_SIZE));
    await new Promise((resolve) => setTimeout(resolve, TYPE_CHUNK_DELAY_MS));
  }
}

/**
 * 로그인 토큰이 유효하면 해당 회원의 채팅 세션을 준비하고, 세션에 저장된
 * collectedInfo/interaction id를 불러옵니다. 토큰이 없거나 유효하지 않으면
 * null을 반환해 비회원으로 처리합니다.
 */
async function resolveAuthedSession(
  token: string | undefined,
  sessionId: string | undefined,
) {
  if (!token) return null;

  try {
    const payload = verifyToken(token);
    const userId = payload.userId as string | undefined;
    if (!userId) return null;

    const session = await getOrCreateAIChatSession(userId, sessionId);
    const activeSessionId = session._id.toString();

    return {
      sessionId: activeSessionId,
      isNewSession: activeSessionId !== sessionId,
      collectedInfo:
        (session.collected_info as SurveyAnswers | null) ?? undefined,
      previousInteractionId: session.last_interaction_id ?? undefined,
    };
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

    socket.on("message", async (payload: ChatMessagePayload) => {
      const {
        message,
        simulateError,
        surveyContext,
        collectedInfo,
        previousInteractionId,
        token,
        sessionId,
      } = payload;

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
        // 회원이면 DB에 저장된 collectedInfo/interaction id를 진짜 상태로 사용하고,
        // 비회원이면 프론트에서 매번 함께 보내주는 값을 그대로 사용함
        const authedSession = await resolveAuthedSession(token, sessionId);
        const effectiveCollectedInfo = authedSession
          ? authedSession.collectedInfo
          : collectedInfo;
        const effectivePreviousInteractionId = authedSession
          ? authedSession.previousInteractionId
          : previousInteractionId;

        if (authedSession) {
          if (authedSession.isNewSession) {
            socket.emit("session", { sessionId: authedSession.sessionId });
          }
          await saveMessage(authedSession.sessionId, "user", message);
        }

        const candidates = await getPlanCandidates();

        const { decision, interactionId } = await getChatDecision({
          message,
          previousInteractionId: effectivePreviousInteractionId,
          surveyContext,
          collectedInfo: effectiveCollectedInfo,
          plans: candidates,
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

        if (authedSession) {
          await saveMessage(
            authedSession.sessionId,
            "admin",
            decision.message,
            cards.length > 0 ? cards : undefined,
          );
          await updateCollectedInfo(
            authedSession.sessionId,
            decision.collectedInfo,
          );
          await updateLastInteractionId(authedSession.sessionId, interactionId);
        }

        // 다음 턴에도 이어서 활용해야 하므로, 회원/비회원 모두 클라이언트로 전달함
        // (비회원은 클라이언트가 이 값을 로컬 스토리지에 저장해뒀다가 다음 요청에 다시 실어 보냄)
        socket.emit("interaction", { interactionId });
        if (decision.collectedInfo) {
          socket.emit("info", decision.collectedInfo);
        }

        await sendTypedText(socket, decision.message);

        if (cards.length > 0) {
          socket.emit("plans", cards);
        }

        socket.emit("done");
      } catch (aiError) {
        console.error("AI 채팅 처리 에러:", aiError);
        socket.emit("error", "AI 서버 연결에 실패했습니다.");
      }
    });

    socket.on("disconnect", () => {
      console.log("🔌 소켓 연결 종료");
    });
  });
}
