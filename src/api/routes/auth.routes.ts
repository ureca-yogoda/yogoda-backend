import { Router } from "express";
import { env } from "../../core/config/env.js";
import {
  kakaoLoginHandler,
  naverLoginHandler,
  googleLoginHandler,
  refreshHandler,
  logoutHandler,
} from "../controllers/auth.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

// Cross-site refresh cookies require an explicit origin check for browser POSTs.
router.use((req, res, next) => {
  const origin = req.get("origin");
  const allowedOrigins = env.CORS_ORIGIN.split(",").map((value) =>
    value.trim(),
  );
  if (
    req.method !== "GET" &&
    ((origin &&
      req.get("sec-fetch-site") !== "same-origin" &&
      !allowedOrigins.includes(origin)) ||
      (!origin && req.get("sec-fetch-site") === "cross-site"))
  ) {
    res.status(403).json({ message: "허용되지 않은 요청 출처입니다." });
    return;
  }
  next();
});

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
 * /api/auth/naver:
 *   post:
 *     summary: 네이버 로그인
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
 *                 description: 네이버 인가 코드
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
 *         description: 네이버 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/naver", naverLoginHandler);

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: 구글 로그인
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
 *                 description: 구글 인가 코드
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
 *       401:
 *         description: 구글 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/google", googleLoginHandler);

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

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: 로그아웃
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 로그아웃 성공
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
 */
router.post("/logout", authMiddleware, logoutHandler);

export default router;
