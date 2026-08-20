import axios from "axios";
import { env } from "../../core/config/env.js";
import { AI_SYSTEM_PROMPT } from "./ai.prompt.js";

/**
 * AI 모델에 메시지를 보내고, 응답 텍스트 조각을 순서대로 yield합니다.
 */
export async function* streamAIChatText(
  message: string,
): AsyncGenerator<string> {
  let response;

  try {
    response = await axios({
      method: "post",
      // alt=sse: 응답을 SSE(빈 줄로 구분된 이벤트) 형식으로 받아서 청크 경계와 상관없이 안전하게 파싱
      url: `https://generativelanguage.googleapis.com/v1beta/models/${env.AI_MODEL}:streamGenerateContent?alt=sse&key=${env.AI_API_KEY}`,
      data: {
        systemInstruction: {
          parts: [{ text: AI_SYSTEM_PROMPT }],
        },
        contents: [
          {
            parts: [{ text: message }],
          },
        ],
      },
      responseType: "stream",
    });
  } catch (err) {
    // 에러 응답 본문도 스트림으로 오기 때문에 읽어서 실제 원인(예: 모델명 오류로 인한 404)을 로그에 남김
    if (axios.isAxiosError(err) && err.response) {
      const status = err.response.status;
      let bodyText = "";
      try {
        for await (const chunk of err.response.data) {
          bodyText += chunk.toString();
        }
      } catch {
        // 본문을 못 읽어도 무시하고 상태 코드만 로깅
      }
      console.error(
        `AI API 호출 에러 (status ${status}):`,
        bodyText || err.message,
      );
    } else {
      console.error("AI API 호출 에러:", err);
    }
    throw new Error("AI_REQUEST_FAILED");
  }

  // 네트워크 청크 경계가 SSE 이벤트 경계(빈 줄)와 다를 수 있으므로, 청크마다 바로 파싱하지 않고
  // 버퍼에 누적하다가 완전한 이벤트가 확보됐을 때만 꺼내서 파싱한다. (텍스트가 중간에 잘려 유실되는 것 방지)
  let buffer = "";
  let yieldedAny = false;

  for await (const chunk of response.data as AsyncIterable<Buffer>) {
    // 서버가 CRLF(\r\n)로 줄바꿈을 보내는 경우 구분자(\n\n)를 못 찾는 문제 방지
    buffer += chunk.toString().replace(/\r\n/g, "\n");

    let separatorIdx: number;
    while ((separatorIdx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, separatorIdx).trim();
      buffer = buffer.slice(separatorIdx + 2);

      for (const text of extractTextFromSSEEvent(rawEvent)) {
        yieldedAny = true;
        yield text;
      }
    }
  }

  // 마지막 이벤트 뒤에 빈 줄이 안 붙어서 버퍼에 남아있는 경우 대비
  for (const text of extractTextFromSSEEvent(buffer.trim())) {
    yieldedAny = true;
    yield text;
  }

  if (!yieldedAny) {
    console.error(
      "AI 응답에서 텍스트를 하나도 추출하지 못했습니다. 원본 응답 형식을 확인하세요.",
    );
  }
}

function extractTextFromSSEEvent(rawEvent: string): string[] {
  if (!rawEvent.startsWith("data:")) return [];

  const jsonStr = rawEvent.slice(5).trim();
  if (!jsonStr) return [];

  try {
    const parsed = JSON.parse(jsonStr);
    const parts = parsed?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return [];

    return parts
      .map((part) => part?.text)
      .filter((text): text is string => typeof text === "string");
  } catch {
    // 불완전하거나 형식이 다른 이벤트는 건너뜀
    return [];
  }
}
