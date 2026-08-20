import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { env } from "../../core/config/env.js";
import { streamAIChatText } from "../../services/ai/ai.client.js";

/**
 * AI 채팅 웹소켓 서버를 셋업합니다.
 */
export function setupChatWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    console.log("🔌 새로운 웹소켓 연결 성공");

    ws.on("message", async (messageBuffer) => {
      try {
        const messageData = JSON.parse(messageBuffer.toString());
        const { message, simulateError } = messageData;

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
          for await (const text of streamAIChatText(message)) {
            ws.send(JSON.stringify({ event: "chunk", data: text }));
          }
          ws.send(JSON.stringify({ event: "done" }));
        } catch (aiError) {
          console.error("AI 채팅 스트리밍 에러:", aiError);
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
