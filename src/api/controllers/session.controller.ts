import type { NextFunction, Request, Response } from "express";

import {
  getSessionDetail,
  getSessionList,
} from "../../services/session.service.js";

const STATUS_VALUES = ["all", "completed", "dropped"] as const;

export async function getSessionListHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const {
      start_date: startDate,
      end_date: endDate,
      status = "all",
      drop_stage: dropStage,
      prompt_version: promptVersion,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string | undefined>;

    if (!STATUS_VALUES.includes(status as (typeof STATUS_VALUES)[number])) {
      res.status(400).json({ message: "잘못된 status 값이에요." });
      return;
    }

    const result = await getSessionList({
      startDate,
      endDate,
      status: status as "all" | "completed" | "dropped",
      dropStage,
      promptVersion,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getSessionDetailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = req.params.sessionId;

    if (typeof sessionId !== "string") {
      res.status(404).json({ message: "세션을 찾을 수 없어요." });
      return;
    }

    res.status(200).json(await getSessionDetail(sessionId));
  } catch (error) {
    next(error);
  }
}
