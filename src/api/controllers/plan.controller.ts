import type { NextFunction, Request, Response } from "express";

import {
  getPlanByCode,
  getPlans,
  joinPlan,
} from "../../services/plan.service.js";

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

export const joinPlanHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const code = req.params.code;
    const userId = req.user?.userId;

    if (typeof code !== "string") {
      res.status(400).json({
        message: "잘못된 요금제 코드입니다.",
      });

      return;
    }

    if (!userId) {
      res.status(401).json({
        message: "로그인이 필요해요.",
      });

      return;
    }

    const selectedOptions = req.body?.selectedOptions ?? {};

    if (
      typeof selectedOptions !== "object" ||
      selectedOptions === null ||
      Array.isArray(selectedOptions)
    ) {
      res.status(400).json({
        message: "혜택 선택 정보가 올바르지 않아요.",
      });

      return;
    }

    const result = await joinPlan(userId, code, selectedOptions);

    res.status(200).json({
      message: "요금제 가입이 완료되었어요.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
