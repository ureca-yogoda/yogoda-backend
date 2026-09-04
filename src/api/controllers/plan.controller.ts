import type { NextFunction, Request, Response } from "express";

import {
  cancelCurrentPlan,
  getCurrentPlan,
  getPlanByCode,
  getPlans,
} from "../../services/plan.service.js";
import { completeMissionFromAction } from "../../services/mission.service.js";
import { comparePlansWithAI } from "../../services/ai/ai.client.js";

export const getPlansHandler = async (
  _req: Request,
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

export const getComparedPlansHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const plans = await getPlans();
    await completeMissionFromAction(
      req.user!.userId,
      "mission-nerget-plan-compare",
    );

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

/*
 * 로그인한 사용자의 현재 가입 요금제를 조회함
 * 가입된 요금제가 없는 경우 null을 반환함
 */
export const getCurrentPlanHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        message: "로그인이 필요해요.",
      });

      return;
    }

    const currentPlan = await getCurrentPlan(userId);
    await completeMissionFromAction(userId, "mission-security-benefit-check");

    res.status(200).json(currentPlan);
  } catch (error) {
    next(error);
  }
};

export const cancelCurrentPlanHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        message: "로그인이 필요해요.",
      });

      return;
    }

    const result = await cancelCurrentPlan(userId);

    res.status(200).json({
      message: "요금제 해지가 완료되었어요.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

// All enrollment must pass the server-owned chat stages; direct REST enrollment is retired.
export const joinPlanHandler = (_req: Request, res: Response) => {
  res.status(410).json({
    code: "SIGNUP_FLOW_REQUIRED",
    message: "AI 상담에서 본인 확인과 최종 확인을 완료해 주세요.",
  });
};

export const changePlanHandler = joinPlanHandler;

/*
 * 두 요금제를 AI로 비교한 결과를 반환함
 * GET /plans/ai-compare?current=CODE&selected=CODE
 */
export const getAIPlanComparisonHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { current, selected } = req.query;

    if (typeof current !== "string" || typeof selected !== "string") {
      res
        .status(400)
        .json({ message: "current와 selected 요금제 코드가 필요합니다." });
      return;
    }

    const [currentPlan, selectedPlan] = await Promise.all([
      getPlanByCode(current),
      getPlanByCode(selected),
    ]);

    if (!currentPlan || !selectedPlan) {
      res.status(404).json({ message: "요금제를 찾을 수 없습니다." });
      return;
    }

    const result = await comparePlansWithAI(
      currentPlan as unknown as Record<string, unknown>,
      selectedPlan as unknown as Record<string, unknown>,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
