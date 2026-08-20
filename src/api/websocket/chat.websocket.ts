import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
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

// AI 응답을 실제로 스트리밍 받지 않아도, 조각내서 순차 전송해 타자기 효과가 자연스럽게 이어지도록 함
async function sendTypedText(ws: WebSocket, text: string) {
  for (let i = 0; i < text.length; i += TYPE_CHUNK_SIZE) {
    ws.send(
      JSON.stringify({
        event: "chunk",
        data: text.slice(i, i + TYPE_CHUNK_SIZE),
      }),
    );
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
    console.error("웹소켓 토큰 검증 실패, 비회원으로 처리합니다:", err);
    return null;
  }
}

/**
 * AI 채팅 웹소켓 서버를 셋업합니다.
 */
export function setupChatWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    console.log("🔌 새로운 웹소켓 연결 성공");

    ws.on("message", async (messageBuffer) => {
      try {
        const messageData = JSON.parse(messageBuffer.toString());
        const {
          message,
          simulateError,
          surveyContext,
          collectedInfo,
          previousInteractionId,
          token,
          sessionId,
        }: {
          message?: string;
          simulateError?: boolean;
          surveyContext?: SurveyContext;
          collectedInfo?: SurveyAnswers;
          previousInteractionId?: string;
          token?: string;
          sessionId?: string;
        } = messageData;

        if (!message || message.trim() === "") {
          ws.send(
            JSON.stringify({
              event: "error",
              data: "메시지가 유효하지 않습니다.",
            }),
          );
          return;
        }

        // 1. 강제 에러 시뮬레이션
        if (simulateError) {
          ws.send(
            JSON.stringify({
              event: "error",
              data: "시뮬레이션 에러가 발생했습니다.",
            }),
          );
          ws.close();
          return;
        }

        // 2. AI API 키 검증
        if (!env.AI_API_KEY) {
          ws.send(
            JSON.stringify({
              event: "error",
              data: "AI API 키가 등록되지 않았습니다.",
            }),
          );
          ws.close();
          return;
        }

        // 3. AI 모델명 검증
        if (!env.AI_MODEL) {
          ws.send(
            JSON.stringify({
              event: "error",
              data: "AI 모델이 설정되지 않았습니다.",
            }),
          );
          ws.close();
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
              ws.send(
                JSON.stringify({
                  event: "session",
                  data: { sessionId: authedSession.sessionId },
                }),
              );
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

          if (authedSession) {
            await saveMessage(
              authedSession.sessionId,
              "admin",
              decision.message,
            );
            await updateCollectedInfo(
              authedSession.sessionId,
              decision.collectedInfo,
            );
            await updateLastInteractionId(
              authedSession.sessionId,
              interactionId,
            );
          }

          // 다음 턴에도 이어서 활용해야 하므로, 회원/비회원 모두 클라이언트로 전달함
          // (비회원은 클라이언트가 이 값을 로컬 스토리지에 저장해뒀다가 다음 요청에 다시 실어 보냄)
          ws.send(
            JSON.stringify({ event: "interaction", data: { interactionId } }),
          );
          if (decision.collectedInfo) {
            ws.send(
              JSON.stringify({ event: "info", data: decision.collectedInfo }),
            );
          }

          await sendTypedText(ws, decision.message);

          if (
            decision.action === "recommend" &&
            decision.recommendations?.length
          ) {
            const cards = buildPlanCards(decision.recommendations, candidates);
            if (cards.length > 0) {
              ws.send(JSON.stringify({ event: "plans", data: cards }));
            }
          }

          ws.send(JSON.stringify({ event: "done" }));
        } catch (aiError) {
          console.error("AI 채팅 처리 에러:", aiError);
          ws.send(
            JSON.stringify({
              event: "error",
              data: "AI 서버 연결에 실패했습니다.",
            }),
          );
        }
      } catch (err) {
        console.error("웹소켓 메시지 처리 에러:", err);
        ws.send(
          JSON.stringify({
            event: "error",
            data: "올바르지 않은 메시지 형식입니다.",
          }),
        );
      }
    });

    ws.on("close", () => {
      console.log("🔌 웹소켓 연결 종료");
    });
  });
}
