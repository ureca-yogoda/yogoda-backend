import type { NextFunction, Request, Response } from "express";

import { analyzePersona } from "../../services/persona.service.js";

export async function analyzePersonaHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await analyzePersona(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
