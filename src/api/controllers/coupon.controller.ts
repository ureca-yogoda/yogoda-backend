import type { NextFunction, Request, Response } from "express";

import {
  type CouponFilter,
  getMyCoupons,
  useMyCoupon,
} from "../../services/coupon.service.js";

const couponFilters: CouponFilter[] = [
  "available",
  "expiring",
  "used",
  "expired",
  "all",
];

export async function getMyCouponsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user!.userId;
    const requestedStatus = req.query.status ?? "available";

    if (
      typeof requestedStatus !== "string" ||
      !couponFilters.includes(requestedStatus as CouponFilter)
    ) {
      res.status(400).json({ message: "잘못된 쿠폰 상태예요." });
      return;
    }

    const result = await getMyCoupons(userId, requestedStatus as CouponFilter);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function useMyCouponHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user!.userId;
    const couponId = req.params.couponId;

    if (typeof couponId !== "string") {
      res.status(400).json({ message: "잘못된 쿠폰 ID예요." });
      return;
    }

    const coupon = await useMyCoupon(userId, couponId);

    res.status(200).json({
      message: "쿠폰 사용이 완료되었어요.",
      coupon,
    });
  } catch (error) {
    next(error);
  }
}
