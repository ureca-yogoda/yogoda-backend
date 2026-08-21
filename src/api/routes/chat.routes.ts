import { Router } from "express";

import { getLatestSession } from "../controllers/chat.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

router.get("/sessions/latest", authMiddleware, getLatestSession);

export default router;
