import type { NextFunction, Request, Response } from "express";

import { getPlanByCode, getPlans } from "../../services/plan.service.js";

export const getPlansHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const plans = await getPlans();

    res.status(200).json(plans);
  } catch (error) {
    next(error);
  }
};

export const getPlanByCodeHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const code = req.params.code;

    if (typeof code !== "string") {
      res.status(400).json({
        message: "잘못된 요금제 코드입니다.",
      });

      return;
    }

    const plan = await getPlanByCode(code);

    if (!plan) {
      res.status(404).json({
        message: "요금제를 찾을 수 없습니다.",
      });

      return;
    }

    res.status(200).json(plan);
  } catch (error) {
    next(error);
  }
};
