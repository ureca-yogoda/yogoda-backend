import type { NextFunction, Request, Response } from "express";

import { getPlans } from "../../services/plan.service.js";

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
