import { Router } from "express";

import {
  activatePromptHandler,
  createPromptHandler,
  getActivePromptHandler,
  getPromptDetailHandler,
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
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 조회할 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: 페이지당 항목 수
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
 *                 totalCount:
 *                   type: number
 *                 page:
 *                   type: number
 *                 limit:
 *                   type: number
 *       400:
 *         description: page 또는 limit 파라미터가 잘못됨
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
router.get("/", authMiddleware, adminMiddleware, getPromptHistoryHandler);

/**
 * @swagger
 * /api/admin/prompts/{versionId}:
 *   get:
 *     summary: 버전 상세 조회
 *     tags: [Admin/Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: string
 *         description: 프롬프트 버전 ID
 *     responses:
 *       200:
 *         description: 버전 상세 조회 성공
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
 *                 deployedAt:
 *                   type: string
 *                   format: date-time
 *                 deployedBy:
 *                   type: string
 *                 conversionRate:
 *                   type: number
 *                 sessionCount:
 *                   type: number
 *                 isActive:
 *                   type: boolean
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
 *         description: 해당 버전을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.get(
  "/:versionId",
  authMiddleware,
  adminMiddleware,
  getPromptDetailHandler,
);

/**
 * @swagger
 * /api/admin/prompts/{versionId}/activate:
 *   patch:
 *     summary: 버전 되돌리기
 *     tags: [Admin/Prompts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: string
 *         description: 활성화할 프롬프트 버전 ID
 *     responses:
 *       200:
 *         description: 버전 활성화 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 versionId:
 *                   type: string
 *                 version:
 *                   type: string
 *                 isActive:
 *                   type: boolean
 *                 deployedAt:
 *                   type: string
 *                   format: date-time
 *                 deployedBy:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: 이미 활성화된 버전
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
 *       404:
 *         description: 해당 버전을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.patch(
  "/:versionId/activate",
  authMiddleware,
  adminMiddleware,
  activatePromptHandler,
);

export default router;
