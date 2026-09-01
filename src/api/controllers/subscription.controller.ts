import type { NextFunction, Request, Response } from "express";

import type {
  SubscriptionCategory,
  SubscriptionStatus,
} from "../../models/user-subscription.model.js";
import {
  addMySubscription,
  cancelMySubscription,
  getMySubscriptions,
  updateMySubscription,
} from "../../services/subscription.service.js";

const categories: SubscriptionCategory[] = [
  "ott",
  "music",
  "shopping",
  "delivery",
  "other",
];
const statuses: SubscriptionStatus[] = ["active", "canceled"];

function parseMonthlyFee(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function parseDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function getMySubscriptionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await getMySubscriptions(req.user!.userId));
  } catch (error) {
    next(error);
  }
}

export async function addMySubscriptionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { serviceCode, serviceName, category, monthlyFee, startedAt } =
      req.body ?? {};
    const fee = parseMonthlyFee(monthlyFee);
    const startDate = parseDate(startedAt);

    if (
      typeof serviceCode !== "string" ||
      !serviceCode.trim() ||
      typeof serviceName !== "string" ||
      !serviceName.trim() ||
      !categories.includes(category) ||
      fee === null ||
      !startDate
    ) {
      res.status(400).json({ message: "구독 정보를 확인해 주세요." });
      return;
    }

    const subscription = await addMySubscription(req.user!.userId, {
      serviceCode: serviceCode.trim().toLowerCase(),
      serviceName: serviceName.trim(),
      category,
      monthlyFee: fee,
      startedAt: startDate,
    });
    res.status(201).json({ message: "구독을 추가했어요.", subscription });
  } catch (error) {
    next(error);
  }
}

export async function updateMySubscriptionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const subscriptionId = String(req.params.subscriptionId ?? "");
    const { monthlyFee, status, startedAt } = req.body ?? {};
    const update: {
      monthlyFee?: number;
      status?: SubscriptionStatus;
      startedAt?: Date;
    } = {};

    if (monthlyFee !== undefined) {
      const fee = parseMonthlyFee(monthlyFee);
      if (fee === null) {
        res.status(400).json({ message: "월 구독료를 확인해 주세요." });
        return;
      }
      update.monthlyFee = fee;
    }
    if (status !== undefined) {
      if (!statuses.includes(status)) {
        res.status(400).json({ message: "구독 상태를 확인해 주세요." });
        return;
      }
      update.status = status;
    }
    if (startedAt !== undefined) {
      const startDate = parseDate(startedAt);
      if (!startDate) {
        res.status(400).json({ message: "구독 시작일을 확인해 주세요." });
        return;
      }
      update.startedAt = startDate;
    }
    if (Object.keys(update).length === 0) {
      res.status(400).json({ message: "변경할 구독 정보가 없어요." });
      return;
    }

    const subscription = await updateMySubscription(
      req.user!.userId,
      subscriptionId,
      update,
    );
    res.status(200).json({ message: "구독 정보를 변경했어요.", subscription });
  } catch (error) {
    next(error);
  }
}

export async function cancelMySubscriptionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const subscription = await cancelMySubscription(
      req.user!.userId,
      String(req.params.subscriptionId ?? ""),
    );
    res.status(200).json({ message: "구독을 종료했어요.", subscription });
  } catch (error) {
    next(error);
  }
}
