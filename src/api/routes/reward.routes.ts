import { Router } from "express";

import {
  checkInHandler,
  getAttendanceHandler,
  getBenefitCalendarHandler,
  getPointWalletHandler,
} from "../controllers/reward.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();
router.get("/attendance", authMiddleware, getAttendanceHandler);
router.post("/attendance/check-in", authMiddleware, checkInHandler);
router.get("/points", authMiddleware, getPointWalletHandler);
router.get("/benefit-calendar", authMiddleware, getBenefitCalendarHandler);
export default router;
