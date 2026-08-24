import { Router } from "express";

import {
  endSession,
  getLatestSession,
  importGuestSession,
} from "../controllers/chat.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

router.get("/sessions/latest", authMiddleware, getLatestSession);
router.post("/sessions/import", authMiddleware, importGuestSession);
router.post("/sessions/end", authMiddleware, endSession);

export default router;
