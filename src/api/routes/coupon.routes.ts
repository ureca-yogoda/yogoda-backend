import { Router } from "express";

import {
  getMyCouponsHandler,
  useMyCouponHandler,
} from "../controllers/coupon.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

/**
 * @openapi
 * /api/coupons/me:
 *   get:
 *     summary: 내 쿠폰함 조회
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [available, expiring, used, expired, all]
 *           default: available
 *     responses:
 *       200:
 *         description: 상태별 쿠폰 개수와 쿠폰 번호·바코드가 포함된 목록
 */
router.get("/me", authMiddleware, getMyCouponsHandler);

/**
 * @openapi
 * /api/coupons/me/{couponId}/use:
 *   patch:
 *     summary: 내 쿠폰 사용 처리
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: couponId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 쿠폰 사용 완료
 *       404:
 *         description: 쿠폰 없음
 *       409:
 *         description: 이미 사용했거나 만료된 쿠폰
 */
router.patch("/me/:couponId/use", authMiddleware, useMyCouponHandler);

export default router;
