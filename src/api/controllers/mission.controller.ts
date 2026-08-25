import type { NextFunction, Request, Response } from "express";

import {
  claimMissionReward,
  getMyMissions,
  joinMission,
} from "../../services/mission.service.js";

function getCode(req: Request) {
  const code = req.params.code;
  if (typeof code !== "string") {
    throw new TypeError("잘못된 미션 코드예요.");
  }
  return code;
}

export async function getMyMissionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await getMyMissions(req.user!.userId));
  } catch (error) {
    next(error);
  }
}

export async function joinMissionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await joinMission(req.user!.userId, getCode(req)));
  } catch (error) {
    next(error);
  }
}

export async function claimMissionRewardHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res
      .status(200)
      .json(await claimMissionReward(req.user!.userId, getCode(req)));
  } catch (error) {
    next(error);
  }
}
