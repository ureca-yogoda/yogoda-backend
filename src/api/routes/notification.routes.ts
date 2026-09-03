import { Router } from "express";

import {
  listNotifications,
  readAllNotifications,
  readNotification,
  readAllNotifications,
  deleteNotification,
} from "../controllers/notification.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         type:
 *           type: string
 *           enum: [coupon_expiring, attendance_reminder, consultation_incomplete, usage_pattern_changed]
 *         title:
 *           type: string
 *         body:
 *           type: string
 *         link:
 *           type: string
 *           nullable: true
 *         readAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @openapi
 * /api/notifications:
 *   get:
 *     summary: 내 알림 목록 조회
 *     description: 로그인한 유저의 알림을 최신순으로 최대 10개까지, 안 읽은 개수와 함께 조회합니다.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 알림 목록 및 안 읽은 개수
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/Notification"
 *                 unreadCount:
 *                   type: integer
 *       401:
 *         description: 인증 실패
 */
router.get("/", authMiddleware, listNotifications);

/**
 * @openapi
 * /api/notifications/read-all:
 *   patch:
 *     summary: 안 읽은 알림 전체 읽음 처리
 *     description: 목록에 보이지 않는 이전 알림까지 로그인 사용자의 안 읽은 알림을 모두 읽음 처리합니다.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 전체 읽음 처리 완료
 *       401:
 *         description: 인증 실패
 */
router.patch("/read-all", authMiddleware, readAllNotifications);

/**
 * @openapi
 * /api/notifications/{notificationId}/read:
 *   patch:
 *     summary: 알림 읽음 처리
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 읽음 처리 완료
 *       400:
 *         description: notificationId가 올바르지 않음
 *       401:
 *         description: 인증 실패
 */
router.patch("/:notificationId/read", authMiddleware, readNotification);

/**
 * @openapi
 * /api/notifications/read-all:
 *   patch:
 *     summary: 안 읽은 알림 전체 읽음 처리
 *     description: 화면에 보이는 최근 알림뿐 아니라, 그보다 이전에 쌓인 안 읽은 알림까지 전부 읽음 처리합니다.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 읽음 처리 완료
 *       401:
 *         description: 인증 실패
 */
router.patch("/read-all", authMiddleware, readAllNotifications);

/**
 * @openapi
 * /api/notifications/{notificationId}:
 *   delete:
 *     summary: 알림 삭제
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 삭제 완료
 *       400:
 *         description: notificationId가 올바르지 않음
 *       401:
 *         description: 인증 실패
 */
router.delete("/:notificationId", authMiddleware, deleteNotification);

export default router;
