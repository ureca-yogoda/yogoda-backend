import { Router } from "express";

import {
  applyDemoUsageScenarioHandler,
  getMyUsageReportHandler,
} from "../controllers/usage.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

router.get("/me", authMiddleware, getMyUsageReportHandler);
router.post(
  "/me/demo/:scenario",
  authMiddleware,
  applyDemoUsageScenarioHandler,
);

export default router;
