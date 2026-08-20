import { Router } from "express";
import { getGuestQuota } from "../controllers/chat.controller.js";

const router = Router();

router.get("/guest-quota", getGuestQuota);

export default router;
