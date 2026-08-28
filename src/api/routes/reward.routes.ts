import { Router } from "express";

import {
  checkInHandler,
  getAttendanceHandler,
  getBenefitCalendarHandler,
  getPointWalletHandler,
  getPointProductsHandler,
  exchangePointProductHandler,
} from "../controllers/reward.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();
router.get("/attendance", authMiddleware, getAttendanceHandler);
router.post("/attendance/check-in", authMiddleware, checkInHandler);
router.get("/points", authMiddleware, getPointWalletHandler);

/**
 * @openapi
 * /api/rewards/point-products:
 *   get:
 *     summary: 포인트 교환 상품 목록 조회
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 보유 포인트와 교환 가능한 쿠폰 상품 목록
 */
router.get("/point-products", authMiddleware, getPointProductsHandler);

/**
 * @openapi
 * /api/rewards/point-products/{productCode}/exchange:
 *   post:
 *     summary: 포인트로 쿠폰 교환
 *     tags: [Rewards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productCode
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 쿠폰 교환 완료와 변경된 포인트 지갑
 *       404:
 *         description: 교환 상품 없음
 *       409:
 *         description: 포인트 부족 또는 재고 소진
 */
router.post(
  "/point-products/:productCode/exchange",
  authMiddleware,
  exchangePointProductHandler,
);
router.get("/benefit-calendar", authMiddleware, getBenefitCalendarHandler);
export default router;
