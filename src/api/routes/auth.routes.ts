import { Router } from "express";
import {
  kakaoLoginHandler,
  refreshHandler,
} from "../controllers/auth.controller.js";

const router = Router();

/**
 * @swagger
 * /api/auth/kakao:
 *   post:
 *     summary: 카카오 로그인
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: 카카오 인가 코드
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 userId:
 *                   type: string
 *                 name:
 *                   type: string
 *                 theme:
 *                   type: string
 *                   enum: [light, dark]
 *                 isNewUser:
 *                   type: boolean
 *                 role:
 *                   type: string
 *       401:
 *         description: 카카오 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/kakao", kakaoLoginHandler);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: 액세스 토큰 재발급
 *     tags: [Auth]
 *     parameters:
 *       - in: cookie
 *         name: refreshToken
 *         required: true
 *         schema:
 *           type: string
 *         description: 로그인 시 발급된 refreshToken 쿠키
 *     responses:
 *       200:
 *         description: 액세스 토큰 재발급 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *       401:
 *         description: 리프레시 토큰이 없거나 유효하지 않음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/refresh", refreshHandler);

export default router;
