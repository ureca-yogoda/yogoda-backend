import type { NextFunction, Request, Response } from "express";

import { getUiElementStats } from "../../services/ui-event.service.js";

const PERIOD_VALUES = ["today", "7d", "30d"] as const;

export async function getUiElementStatsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { period = "today" } = req.query as Record<
      string,
      string | undefined
    >;

    if (!PERIOD_VALUES.includes(period as (typeof PERIOD_VALUES)[number])) {
      res.status(400).json({ message: "잘못된 period 값이에요." });
      return;
    }

    const result = await getUiElementStats(
      period as (typeof PERIOD_VALUES)[number],
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
