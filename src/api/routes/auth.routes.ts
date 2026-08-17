import { Router } from "express";
import { kakaoLoginHandler } from "../controllers/auth.controller.js";

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

export default router;
