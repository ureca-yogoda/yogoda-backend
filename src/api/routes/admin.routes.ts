import { Router } from "express";

import { getSessionListHandler } from "../controllers/session.controller.js";
import {
  adminMiddleware,
  authMiddleware,
} from "../../core/middlewares/auth.middleware.js";

const router = Router();

/**
 * @swagger
 * /api/admin/sessions:
 *   get:
 *     summary: 세션 목록 조회
 *     tags: [Admin/Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *         description: 조회 시작일 (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *         description: 조회 종료일 (YYYY-MM-DD)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, completed, dropped]
 *           default: all
 *         description: 상태 필터
 *       - in: query
 *         name: drop_stage
 *         schema:
 *           type: string
 *         description: 이탈 단계 필터 (전환 이벤트명)
 *       - in: query
 *         name: prompt_version
 *         schema:
 *           type: string
 *         description: 프롬프트 버전 필터
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 20
 *     responses:
 *       200:
 *         description: 세션 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalCount:
 *                   type: number
 *                 completedCount:
 *                   type: number
 *                 droppedCount:
 *                   type: number
 *                 page:
 *                   type: number
 *                 limit:
 *                   type: number
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sessionId:
 *                         type: string
 *                       userName:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [completed, dropped]
 *                       dropStage:
 *                         type: string
 *                         nullable: true
 *                       dropStageLabel:
 *                         type: string
 *                         nullable: true
 *                       promptVersion:
 *                         type: string
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       duration:
 *                         type: number
 *                         description: 세션 지속 시간 (초)
 *       400:
 *         description: 잘못된 쿼리 파라미터
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
router.get("/sessions", authMiddleware, adminMiddleware, getSessionListHandler);

export default router;
