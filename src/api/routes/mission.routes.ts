import { Router } from "express";

import {
  claimMissionRewardHandler,
  getMyMissionsHandler,
  joinMissionHandler,
} from "../controllers/mission.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

router.get("/me", authMiddleware, getMyMissionsHandler);
router.post("/:code/join", authMiddleware, joinMissionHandler);
router.patch("/:code/claim", authMiddleware, claimMissionRewardHandler);

export default router;
