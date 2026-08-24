import { Router } from "express";

import {
  createPromptHandler,
  getActivePromptHandler,
  getPromptHistoryHandler,
} from "../controllers/prompt.controller.js";
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

/**
 * @swagger
 * /api/admin/prompts:
 *   post:
 *     summary: 새 버전 생성 및 배포
 *     tags: [Admin/Prompts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *               - summary
 *             properties:
 *               content:
 *                 type: string
 *                 description: 수정된 프롬프트 전체 내용
 *               summary:
 *                 type: string
 *                 description: 수정 내용 요약 (히스토리용)
 *     responses:
 *       200:
 *         description: 새 버전 생성 및 배포 성공
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
 *                 summary:
 *                   type: string
 *                 isActive:
 *                   type: boolean
 *                 deployedAt:
 *                   type: string
 *                   format: date-time
 *                 deployedBy:
 *                   type: string
 *       400:
 *         description: 프롬프트 내용 또는 요약 누락
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
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
 */
router.post("/", authMiddleware, adminMiddleware, createPromptHandler);

/**
 * @swagger
 * /api/admin/prompts:
 *   get:
 *     summary: 버전 히스토리 조회
 *     tags: [Admin/Prompts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 전체 버전 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 versions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       versionId:
 *                         type: string
 *                       version:
 *                         type: string
 *                       summary:
 *                         type: string
 *                       deployedAt:
 *                         type: string
 *                         format: date-time
 *                       deployedBy:
 *                         type: string
 *                       conversionRate:
 *                         type: number
 *                       conversionRateChange:
 *                         type: number
 *                         nullable: true
 *                       sessionCount:
 *                         type: number
 *                       isActive:
 *                         type: boolean
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
 */
router.get("/", authMiddleware, adminMiddleware, getPromptHistoryHandler);

export default router;
