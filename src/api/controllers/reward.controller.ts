import type { NextFunction, Request, Response } from "express";

import { getPointWallet } from "../../services/point.service.js";
import {
  exchangePointProduct,
  getPointProducts,
} from "../../services/point-shop.service.js";
import {
  checkIn,
  getAttendance,
  getBenefitCalendar,
} from "../../services/reward.service.js";

function getMonth(req: Request) {
  return typeof req.query.month === "string"
    ? req.query.month
    : new Date().toISOString().slice(0, 7);
}

export async function getAttendanceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await getAttendance(req.user!.userId, getMonth(req)));
  } catch (error) {
    next(error);
  }
}

export async function checkInHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await checkIn(req.user!.userId));
  } catch (error) {
    next(error);
  }
}

export async function getPointWalletHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await getPointWallet(req.user!.userId));
  } catch (error) {
    next(error);
  }
}

export async function getBenefitCalendarHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res
      .status(200)
      .json(await getBenefitCalendar(req.user!.userId, getMonth(req)));
  } catch (error) {
    next(error);
  }
}

export async function getPointProductsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await getPointProducts(req.user!.userId));
  } catch (error) {
    next(error);
  }
}

export async function exchangePointProductHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const productCode = req.params.productCode;
    const idempotencyKey = req.header("Idempotency-Key")?.trim();

    if (typeof productCode !== "string" || !productCode) {
      res.status(400).json({ message: "잘못된 교환 상품 코드예요." });
      return;
    }
    if (!idempotencyKey || idempotencyKey.length > 100) {
      res.status(400).json({ message: "유효한 Idempotency-Key가 필요해요." });
      return;
    }

    const result = await exchangePointProduct(
      req.user!.userId,
      productCode,
      idempotencyKey,
    );
    res.status(200).json({ message: "쿠폰 교환이 완료되었어요.", ...result });
  } catch (error) {
    next(error);
  }
}
