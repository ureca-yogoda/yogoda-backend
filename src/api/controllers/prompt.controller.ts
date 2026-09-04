import type { NextFunction, Request, Response } from "express";

import { getChatDecision } from "../../services/ai/ai.client.js";
import { getPlanCandidates } from "../../services/plan-recommendation.service.js";
import {
  activatePromptVersion,
  createAndDeployPrompt,
  getActivePrompt,
  getDraft,
  getPromptDetail,
  getPromptHistory,
  saveDraft,
} from "../../services/prompt.service.js";
import type { SurveyAnswers } from "../../types/chat.js";

export async function getActivePromptHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await getActivePrompt());
  } catch (error) {
    next(error);
  }
}

export async function createPromptHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { content, summary } = (req.body ?? {}) as {
      content?: unknown;
      summary?: unknown;
    };

    if (typeof content !== "string" || content.trim() === "") {
      res.status(400).json({ message: "프롬프트 내용을 입력해주세요." });
      return;
    }

    if (typeof summary !== "string" || summary.trim() === "") {
      res.status(400).json({ message: "수정 내용 요약을 입력해주세요." });
      return;
    }

    const result = await createAndDeployPrompt(
      content,
      summary,
      req.user!.userId,
      req.user!.nickname,
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getPromptHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    if (!Number.isInteger(page) || page < 1) {
      res.status(400).json({ message: "page는 1 이상의 정수여야 해요." });
      return;
    }

    if (!Number.isInteger(limit) || limit < 1) {
      res.status(400).json({ message: "limit은 1 이상의 정수여야 해요." });
      return;
    }

    res.status(200).json(await getPromptHistory(page, limit));
  } catch (error) {
    next(error);
  }
}

export async function getPromptDetailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const versionId = req.params.versionId;

    if (typeof versionId !== "string") {
      res.status(404).json({ message: "해당 버전을 찾을 수 없어요." });
      return;
    }

    res.status(200).json(await getPromptDetail(versionId));
  } catch (error) {
    next(error);
  }
}

export async function getDraftHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await getDraft());
  } catch (error) {
    next(error);
  }
}

export async function saveDraftHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { content } = (req.body ?? {}) as { content?: unknown };

    if (typeof content !== "string" || content.trim() === "") {
      res.status(400).json({ message: "프롬프트 내용을 입력해주세요." });
      return;
    }

    const result = await saveDraft(content, req.user!.userId);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

function writeSseEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function testPromptHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { promptContent, message, previousInteractionId, collectedInfo } =
      (req.body ?? {}) as {
        promptContent?: unknown;
        message?: unknown;
        previousInteractionId?: unknown;
        collectedInfo?: unknown;
      };

    if (typeof promptContent !== "string" || promptContent.trim() === "") {
      res.status(400).json({ message: "프롬프트 내용을 입력해주세요." });
      return;
    }

    if (typeof message !== "string" || message.trim() === "") {
      res.status(400).json({ message: "테스트 메시지를 입력해주세요." });
      return;
    }

    // 테스트 전용 호출이라 특정 유저의 현재 요금제 컨텍스트는 없음
    const plans = await getPlanCandidates();

    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    // 관리자가 화면을 벗어나면 진행 중인 AI 호출을 중단함 (실제 세션이 아니라
    // 테스트용 1회성 호출이라, 클라이언트가 떠나면 바로 끊는 게 자연스러움)
    const abortController = new AbortController();
    req.on("close", () => abortController.abort());

    const { decision, interactionId } = await getChatDecision(
      {
        message,
        previousInteractionId:
          typeof previousInteractionId === "string"
            ? previousInteractionId
            : undefined,
        collectedInfo:
          typeof collectedInfo === "object" && collectedInfo !== null
            ? (collectedInfo as SurveyAnswers)
            : undefined,
        plans,
        promptContent,
        currentPlanCode: null,
      },
      (text) => writeSseEvent(res, "chunk", { text }),
      // 텍스트 스트리밍은 끝났지만 추천/퀵리플라이 등 메타데이터 정리가 아직 남아있음을
      // 알려줌 (실제 채팅 소켓의 loading_extra와 동일한 시점)
      () => writeSseEvent(res, "loading_extra", {}),
      abortController.signal,
    );

    writeSseEvent(res, "done", { interactionId, decision });
    res.end();
  } catch (error) {
    if (res.headersSent) {
      writeSseEvent(res, "error", {
        message: "AI 응답 생성 중 오류가 발생했어요.",
      });
      res.end();
      return;
    }
    next(error);
  }
}

export async function activatePromptHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const versionId = req.params.versionId;

    if (typeof versionId !== "string") {
      res.status(404).json({ message: "해당 버전을 찾을 수 없어요." });
      return;
    }

    const result = await activatePromptVersion(
      versionId,
      req.user!.userId,
      req.user!.nickname,
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
