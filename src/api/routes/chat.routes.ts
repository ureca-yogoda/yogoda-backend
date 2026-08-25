import { Router } from "express";

import {
  endSession,
  getLatestSession,
  importGuestSession,
} from "../controllers/chat.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     ChatMessagePlanCard:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *         badge:
 *           type: string
 *         name:
 *           type: string
 *         price:
 *           type: string
 *         specs:
 *           type: string
 *         savings:
 *           type: string
 *         matchRate:
 *           type: string
 *     ChatMessage:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         role:
 *           type: string
 *           enum: [user, ai]
 *         content:
 *           type: string
 *         plans:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/ChatMessagePlanCard"
 *         createdAt:
 *           type: string
 *           format: date-time
 *     ChatSession:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         endedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: 채팅 끝내기로 세션이 종료된 시각. 진행 중이면 null
 */

/**
 * @openapi
 * /api/chats/sessions/latest:
 *   get:
 *     summary: 내 최근 AI 채팅 세션 조회
 *     description: |
 *       로그인한 사용자의 가장 최근 AI 채팅 세션과 전체 대화 내역을 조회합니다.
 *       채팅 페이지 진입 시 이전 대화를 복원하는 데 사용합니다.
 *       세션이 하나도 없으면 session은 null, messages는 빈 배열로 응답합니다.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 최근 세션 및 대화 내역
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session:
 *                   allOf:
 *                     - $ref: "#/components/schemas/ChatSession"
 *                   nullable: true
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/ChatMessage"
 *                 collectedInfo:
 *                   type: object
 *                   nullable: true
 *                   description: 대화로 파악된 사용자 정보 (설문 응답 등)
 *                 previousInteractionId:
 *                   type: string
 *                   nullable: true
 *                   description: Gemini Interactions API 맥락 이어가기용 토큰
 *       401:
 *         description: 인증 실패
 */
router.get("/sessions/latest", authMiddleware, getLatestSession);

/**
 * @openapi
 * /api/chats/sessions/import:
 *   post:
 *     summary: 비회원 채팅 세션을 회원 세션으로 승격
 *     description: |
 *       소셜 로그인 콜백 성공 직후, 비회원(게스트) 상태에서 소켓 연결 시점에 이미
 *       만들어진 세션(session_created로 전달받은 sessionId)을 회원 세션으로 승격시킵니다.
 *       메시지는 이미 그 세션에 실시간 저장돼 있으므로 별도로 넘길 필요가 없습니다.
 *       다른 유저 소유이거나 이미 종료된 세션은 승격되지 않고 session: null로 응답합니다.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: session_created로 전달받은 비회원 세션 id
 *     responses:
 *       200:
 *         description: |
 *           승격 완료. 승격할 세션을 찾지 못하면 session은 null로 응답합니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session:
 *                   allOf:
 *                     - $ref: "#/components/schemas/ChatSession"
 *                   nullable: true
 *       401:
 *         description: 인증 실패
 */
router.post("/sessions/import", authMiddleware, importGuestSession);

/**
 * @openapi
 * /api/chats/sessions/end:
 *   post:
 *     summary: AI 채팅 세션 종료
 *     description: |
 *       회원이 "채팅 끝내기"를 눌렀을 때 현재 진행 중인 AI 채팅 세션을 종료 처리합니다.
 *       대화 내역은 삭제하지 않고 ended_at만 기록하며, 다음 접속 시에는 이 세션을
 *       재사용하지 않고 새 세션을 발급합니다.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: 종료할 채팅 세션 id
 *     responses:
 *       200:
 *         description: 채팅 종료 완료
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: sessionId가 올바르지 않음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: 인증 실패
 */
router.post("/sessions/end", authMiddleware, endSession);

export default router;
