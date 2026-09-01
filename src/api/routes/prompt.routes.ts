import { Router } from "express";

import {
  activatePromptHandler,
  createPromptHandler,
  getActivePromptHandler,
  getDraftHandler,
  getPromptDetailHandler,
  getPromptHistoryHandler,
  saveDraftHandler,
  testPromptHandler,
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
 * /api/admin/prompts/draft:
 *   get:
 *     summary: 임시저장된 프롬프트 조회
 *     description: 임시저장된 내용이 없으면 현재 운영 중인 프롬프트를 기본값으로 반환함
 *     tags: [Admin/Prompts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                 baseVersion:
 *                   type: string
 *                   nullable: true
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 updatedBy:
 *                   type: string
 *                   nullable: true
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
router.get("/draft", authMiddleware, adminMiddleware, getDraftHandler);

/**
 * @swagger
 * /api/admin/prompts/draft:
 *   put:
 *     summary: 프롬프트 임시저장
 *     description: 배포하지 않고 편집 중인 내용만 저장함. draft는 하나만 유지됨
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
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: 임시저장 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                 baseVersion:
 *                   type: string
 *                   nullable: true
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 updatedBy:
 *                   type: string
 *                   nullable: true
 *       400:
 *         description: 프롬프트 내용 누락
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
router.put("/draft", authMiddleware, adminMiddleware, saveDraftHandler);

/**
 * @swagger
 * /api/admin/prompts/test:
 *   post:
 *     summary: 프롬프트 테스트 (단일 테스트 / 버전 비교 공용)
 *     description: >
 *       저장 여부와 무관하게 넘어온 프롬프트 내용으로 실제 AI 응답을 받아본다.
 *       세션 생성이나 DB 저장 없이 1회성으로만 동작하며, 응답은 SSE(text/event-stream)로
 *       스트리밍된다. 버전 비교 화면은 이 엔드포인트를 좌/우 두 번 동시 호출해서 구현한다.
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
 *               - promptContent
 *               - message
 *             properties:
 *               promptContent:
 *                 type: string
 *                 description: 테스트할 프롬프트 전체 내용
 *               message:
 *                 type: string
 *                 description: 테스트로 보낼 사용자 메시지
 *               previousInteractionId:
 *                 type: string
 *                 nullable: true
 *                 description: 이전 턴과 이어가려면 직전 응답의 done 이벤트에서 받은 값을 전달
 *               collectedInfo:
 *                 type: object
 *                 description: '"이미 파악된 정보"를 가정하고 테스트할 때 사용 (전부 선택)'
 *                 properties:
 *                   usageType:
 *                     type: string
 *                   monthlyData:
 *                     type: string
 *                   contentPreference:
 *                     type: string
 *                   benefitPreference:
 *                     type: string
 *                   planPriority:
 *                     type: string
 *                   recommendationPriority:
 *                     type: string
 *     responses:
 *       200:
 *         description: >
 *           SSE 스트림. chunk 이벤트로 토큰이 순차 전송되고,
 *           done 이벤트로 interactionId와 구조화된 decision이 전송됨.
 *           중간 에러는 error 이벤트로 전송됨.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: 프롬프트 내용 또는 테스트 메시지 누락
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
router.post("/test", authMiddleware, adminMiddleware, testPromptHandler);

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
