import { Router } from "express";

import {
  cancelCurrentPlanHandler,
  changePlanHandler,
  getAIPlanComparisonHandler,
  getComparedPlansHandler,
  getCurrentPlanHandler,
  getPlanByCodeHandler,
  getPlansHandler,
  joinPlanHandler,
} from "../controllers/plan.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

router.get("/", getPlansHandler);
/**
 * @swagger
 * /api/plans/ai-compare:
 *   get:
 *     summary: 두 요금제를 AI로 비교
 *     description: 현재 요금제와 비교 대상 요금제의 전체 스펙·혜택을 AI가 분석해 항목별 비교 결과와 최종 추천을 반환합니다.
 *     tags:
 *       - Plans
 *     parameters:
 *       - in: query
 *         name: current
 *         required: true
 *         schema:
 *           type: string
 *         description: 현재 요금제 코드
 *         example: nerget-36
 *       - in: query
 *         name: selected
 *         required: true
 *         schema:
 *           type: string
 *         description: 비교할 요금제 코드
 *         example: nerget-52
 *     responses:
 *       200:
 *         description: AI 비교 결과
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rows:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                         example: 데이터
 *                       current:
 *                         type: string
 *                         example: 100GB
 *                       selected:
 *                         type: string
 *                         example: 무제한
 *                       winner:
 *                         type: string
 *                         enum: [current, selected, tie, none]
 *                         example: selected
 *                 oneLineSummary:
 *                   type: string
 *                   example: 혜택·데이터 모두 추천이 앞서요
 *                 recommendation:
 *                   type: string
 *                   enum: [current, selected, tie]
 *                   example: selected
 *                 summaryReason:
 *                   type: string
 *                   example: 추천 요금제로 변경하면 동일한 요금에 무제한 데이터를 이용할 수 있어요.
 *       400:
 *         description: current 또는 selected 파라미터 누락
 *       404:
 *         description: 요금제를 찾을 수 없음
 */
router.get("/ai-compare", getAIPlanComparisonHandler);
router.get("/me/compare", authMiddleware, getComparedPlansHandler);

/*
 * 현재 로그인한 사용자의 가입 요금제를 조회함
 * 동적 라우트보다 먼저 선언해서 "me"가 요금제 코드로 처리되지 않도록 함
 */
router.get("/me/current", authMiddleware, getCurrentPlanHandler);
router.delete("/me/current", authMiddleware, cancelCurrentPlanHandler);

router.post("/:code/join", authMiddleware, joinPlanHandler);

/*
 * 현재 이용 중인 요금제를 다른 요금제로 변경함
 */
router.patch("/:code/change", authMiddleware, changePlanHandler);

router.get("/:code", getPlanByCodeHandler);

export default router;
