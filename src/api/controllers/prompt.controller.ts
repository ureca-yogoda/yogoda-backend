import type { NextFunction, Request, Response } from "express";

import {
  activatePromptVersion,
  createAndDeployPrompt,
  getActivePrompt,
  getDraft,
  getPromptDetail,
  getPromptHistory,
  saveDraft,
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
  req: Request,
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
