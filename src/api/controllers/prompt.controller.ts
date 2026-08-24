import type { NextFunction, Request, Response } from "express";

import { getActivePrompt } from "../../services/prompt.service.js";

export async function getActivePromptHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await getActivePrompt());
  } catch (error) {
    next(error);
  }
}
