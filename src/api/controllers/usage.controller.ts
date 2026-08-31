import type { NextFunction, Request, Response } from "express";

import {
  applyDemoUsageScenario,
  type DemoUsageScenario,
  getMyUsageReport,
  getMyUsageRecommendation,
} from "../../services/usage.service.js";

const scenarios: DemoUsageScenario[] = ["baseline", "usage-drop"];

export async function getMyUsageReportHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await getMyUsageReport(req.user!.userId));
  } catch (error) {
    next(error);
  }
}

export async function getMyUsageRecommendationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await getMyUsageRecommendation(req.user!.userId));
  } catch (error) {
    next(error);
  }
}

export async function applyDemoUsageScenarioHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const scenario = String(req.params.scenario ?? "");
    if (!scenarios.includes(scenario as DemoUsageScenario)) {
      res.status(400).json({ message: "지원하지 않는 시연 시나리오예요." });
      return;
    }

    res.status(200).json({
      message: "시연 사용 이력을 적용했어요.",
      report: await applyDemoUsageScenario(
        req.user!.userId,
        scenario as DemoUsageScenario,
      ),
    });
  } catch (error) {
    next(error);
  }
}
