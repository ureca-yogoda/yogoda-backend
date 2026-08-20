import { Router } from "express";

import {
  getGuestQuota,
  getLatestSession,
} from "../controllers/chat.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

router.get("/guest-quota", getGuestQuota);
router.get("/sessions/latest", authMiddleware, getLatestSession);

export default router;
