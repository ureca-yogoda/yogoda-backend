import type { NextFunction, Request, Response } from "express";

import {
  createAndDeployPrompt,
  getActivePrompt,
  getPromptHistory,
} from "../../services/prompt.service.js";

export async function getActivePromptHandler(
  req: Request,
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
    res.status(200).json(await getPromptHistory());
  } catch (error) {
    next(error);
  }
}
