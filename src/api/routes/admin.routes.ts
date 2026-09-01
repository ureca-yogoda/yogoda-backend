import { Router } from "express";

import { getDashboardHandler } from "../controllers/dashboard.controller.js";
import {
  getSessionDetailHandler,
  getSessionListHandler,
} from "../controllers/session.controller.js";
import { getUiElementStatsHandler } from "../controllers/ui-element.controller.js";
import {
  adminMiddleware,
  authMiddleware,
} from "../../core/middlewares/auth.middleware.js";

const router = Router();

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: 대시보드 전체 조회
 *     tags: [Admin/Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, 7d, 30d]
 *           default: today
 *         description: 조회 기간
 *     responses:
 *       200:
 *         description: 대시보드 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 kpi:
 *                   type: object
 *                   properties:
 *                     consultationCount:
 *                       type: number
 *                     consultationChange:
 *                       type: number
 *                     consultationPrev:
 *                       type: number
 *                     signupCount:
 *                       type: number
 *                     signupChange:
 *                       type: number
 *                     signupPrev:
 *                       type: number
 *                     conversionRate:
 *                       type: number
 *                     conversionRateChange:
 *                       type: number
 *                     conversionRatePrev:
 *                       type: number
 *                 funnel:
 *                   type: object
 *                   properties:
 *                     totalDropRate:
 *                       type: number
 *                     maxDropStage:
 *                       type: string
 *                       nullable: true
 *                     stages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           stage:
 *                             type: string
 *                           label:
 *                             type: string
 *                           count:
 *                             type: number
 *                           entryRate:
 *                             type: number
 *                           dropRate:
 *                             type: number
 *                             nullable: true
 *                 promptConversion:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       version:
 *                         type: string
 *                       conversionRate:
 *                         type: number
 *                       sessionCount:
 *                         type: number
 *                       isActive:
 *                         type: boolean
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
router.get("/dashboard", authMiddleware, adminMiddleware, getDashboardHandler);

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
 *         name: chat_log_consent
 *         schema:
 *           type: boolean
 *         description: 채팅 기록 열람 동의 여부 필터. 생략하면 전체 조회 (false는 미응답 포함)
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
 *                       chatLogConsent:
 *                         type: boolean
 *                         description: 채팅 기록 열람 동의 여부 (false면 상세 조회 시 messages가 빈 배열로 옴)
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

/**
 * @swagger
 * /api/admin/sessions/{sessionId}:
 *   get:
 *     summary: 세션 상세 조회
 *     tags: [Admin/Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: 세션 ID
 *     responses:
 *       200:
 *         description: 세션 상세 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 userName:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [completed, dropped]
 *                 dropStage:
 *                   type: string
 *                   nullable: true
 *                 dropStageLabel:
 *                   type: string
 *                   nullable: true
 *                 promptVersion:
 *                   type: string
 *                   nullable: true
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 duration:
 *                   type: number
 *                   description: 세션 지속 시간 (초)
 *                 chatLogConsent:
 *                   type: boolean
 *                   description: 채팅 기록 열람 동의 여부. false면 messages는 항상 빈 배열
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       messageId:
 *                         type: string
 *                       sender:
 *                         type: string
 *                         enum: [user, ai]
 *                       content:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
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
 *         description: 세션을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.get(
  "/sessions/:sessionId",
  authMiddleware,
  adminMiddleware,
  getSessionDetailHandler,
);

/**
 * @swagger
 * /api/admin/ui-elements:
 *   get:
 *     summary: UI 요소별 성과 조회
 *     tags: [Admin/UI Elements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, 7d, 30d]
 *           default: today
 *         description: 조회 기간
 *     responses:
 *       200:
 *         description: UI 요소별 성과 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalImpressions:
 *                   type: number
 *                 overallCtr:
 *                   type: number
 *                 overallCtrChange:
 *                   type: number
 *                 elements:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       element:
 *                         type: string
 *                       label:
 *                         type: string
 *                       impressions:
 *                         type: number
 *                       clicks:
 *                         type: number
 *                       ctr:
 *                         type: number
 *                       ctrChange:
 *                         type: number
 *                       lowCtr:
 *                         type: boolean
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
router.get(
  "/ui-elements",
  authMiddleware,
  adminMiddleware,
  getUiElementStatsHandler,
);

export default router;
