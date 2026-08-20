import { Router } from "express";

import {
  getPlanByCodeHandler,
  getPlansHandler,
  joinPlanHandler,
} from "../controllers/plan.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

router.get("/", getPlansHandler);

router.post("/:code/join", authMiddleware, joinPlanHandler);

router.get("/:code", getPlanByCodeHandler);

export default router;
