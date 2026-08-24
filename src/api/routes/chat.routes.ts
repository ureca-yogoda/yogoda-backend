import { Router } from "express";

import {
  getLatestSession,
  importGuestSession,
} from "../controllers/chat.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

router.get("/sessions/latest", authMiddleware, getLatestSession);
router.post("/sessions/import", authMiddleware, importGuestSession);

export default router;
