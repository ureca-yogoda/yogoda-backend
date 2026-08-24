import type { NextFunction, Request, Response } from "express";

import { getPointWallet } from "../../services/point.service.js";
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
