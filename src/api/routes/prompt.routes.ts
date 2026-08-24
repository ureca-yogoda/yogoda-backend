import { Router } from "express";

import { getActivePromptHandler } from "../controllers/prompt.controller.js";
import {
  adminMiddleware,
  authMiddleware,
} from "../../core/middlewares/auth.middleware.js";

const router = Router();

/**
 * @swagger
 * /api/admin/prompts/active:
 *   get:
 *     summary: 현재 프롬프트 조회
 *     tags: [Admin/Prompts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 활성 프롬프트 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 versionId:
 *                   type: string
 *                 version:
 *                   type: string
 *                 content:
 *                   type: string
 *                 isActive:
 *                   type: boolean
 *                 deployedAt:
 *                   type: string
 *                   format: date-time
 *                 deployedBy:
 *                   type: string
 *                 conversionRate:
 *                   type: number
 *                 sessionCount:
 *                   type: number
 *                 charCount:
 *                   type: number
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       403:
 *         description: 관리자가 아님
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: 활성 프롬프트가 없음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.get("/active", authMiddleware, adminMiddleware, getActivePromptHandler);

export default router;
