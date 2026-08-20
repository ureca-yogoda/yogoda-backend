import type { NextFunction, Request, Response } from "express";

import {
  changePlan,
  getCurrentPlan,
  getPlanByCode,
  getPlans,
  joinPlan,
} from "../../services/plan.service.js";

type SelectedPlanOptions = Record<string, string[]>;

/*
 * 가입/변경 API에서 전달받은 혜택 선택 값의 기본 형식을 검증함
 * 실제 선택 가능 여부와 선택 개수 검증은 service에서 처리함
 */
function getSelectedOptions(body: unknown): SelectedPlanOptions | null {
  if (!body || typeof body !== "object") {
    return {};
  }

  const selectedOptions = (body as { selectedOptions?: unknown })
    .selectedOptions;

  if (selectedOptions === undefined) {
    return {};
  }

  if (
    typeof selectedOptions !== "object" ||
    selectedOptions === null ||
    Array.isArray(selectedOptions)
  ) {
    return null;
  }

  const isValid = Object.values(selectedOptions).every(
    (value) =>
      Array.isArray(value) &&
      value.every((optionCode) => typeof optionCode === "string"),
  );

  if (!isValid) {
    return null;
  }

  return selectedOptions as SelectedPlanOptions;
}

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

    res.status(200).json(currentPlan);
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

    const selectedOptions = getSelectedOptions(req.body);

    if (!selectedOptions) {
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

/*
 * 현재 이용 중인 요금제를 다른 요금제로 변경함
 */
export const changePlanHandler = async (
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

    const selectedOptions = getSelectedOptions(req.body);

    if (!selectedOptions) {
      res.status(400).json({
        message: "혜택 선택 정보가 올바르지 않아요.",
      });

      return;
    }

    const result = await changePlan(userId, code, selectedOptions);

    res.status(200).json({
      message: "요금제 변경이 완료되었어요.",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
