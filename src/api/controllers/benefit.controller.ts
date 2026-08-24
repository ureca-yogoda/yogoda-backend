import type { NextFunction, Request, Response } from "express";

import {
  type BenefitFilter,
  getBenefit,
  getBenefits,
  getNearbyBenefits,
  getSavedBenefits,
  removeSavedBenefit,
  saveBenefit,
} from "../../services/benefit.service.js";
import { completeMissionFromAction } from "../../services/mission.service.js";

const filters: BenefitFilter[] = ["all", "membership", "partner", "discount"];

function getCoordinate(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : undefined;
}

export async function getNearbyBenefitsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(
      await getNearbyBenefits(req.user!.userId, {
        latitude: getCoordinate(req.query.latitude),
        longitude: getCoordinate(req.query.longitude),
        maxDistance: getCoordinate(req.query.maxDistance),
      }),
    );
  } catch (error) {
    next(error);
  }
}

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
    const userId = req.user!.userId;
    const result = await saveBenefit(userId, String(req.params.code));

    if (result.savedCount >= 3) {
      await completeMissionFromAction(userId, "mission-benefit-preference");
    }

    res.status(200).json(result);
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
