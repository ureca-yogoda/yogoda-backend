import type { NextFunction, Request, Response } from "express";

import {
  type BenefitFilter,
  getBenefit,
  getBenefits,
  getSavedBenefits,
  removeSavedBenefit,
  saveBenefit,
} from "../../services/benefit.service.js";
import { completeMissionFromAction } from "../../services/mission.service.js";

const filters: BenefitFilter[] = ["all", "membership", "partner", "discount"];

export async function getBenefitsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const filter = req.query.category ?? "all";

    if (
      typeof filter !== "string" ||
      !filters.includes(filter as BenefitFilter)
    ) {
      res.status(400).json({ message: "잘못된 혜택 카테고리예요." });
      return;
    }

    const result = await getBenefits(req.user!.userId, filter as BenefitFilter);
    await completeMissionFromAction(
      req.user!.userId,
      "mission-august-event-check",
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getSavedBenefitsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await getSavedBenefits(req.user!.userId));
  } catch (error) {
    next(error);
  }
}

export async function saveBenefitHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res
      .status(200)
      .json(await saveBenefit(req.user!.userId, String(req.params.code)));
  } catch (error) {
    next(error);
  }
}

export async function removeSavedBenefitHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res
      .status(200)
      .json(
        await removeSavedBenefit(req.user!.userId, String(req.params.code)),
      );
  } catch (error) {
    next(error);
  }
}

export async function getBenefitHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const code = req.params.code;

    if (typeof code !== "string") {
      res.status(400).json({ message: "잘못된 혜택 코드예요." });
      return;
    }

    res.status(200).json(await getBenefit(req.user!.userId, code));
  } catch (error) {
    next(error);
  }
}
