import type { NextFunction, Request, Response } from "express";

import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  removeNotification,
} from "../../services/notification.service.js";

/**
 * 로그인한 유저의 알림 목록(최신순 최대 10개)과 안 읽은 개수를 함께 조회합니다.
 */
export async function listNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user!.userId;
    const [notifications, unreadCount] = await Promise.all([
      getNotifications(userId),
      getUnreadNotificationCount(userId),
    ]);

    res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    next(error);
  }
}

/**
 * 알림 하나를 읽음 처리합니다.
 */
export async function readNotification(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user!.userId;
    const { notificationId } = req.params;

    if (typeof notificationId !== "string" || notificationId.trim() === "") {
      res.status(400).json({ message: "notificationId가 올바르지 않아요." });
      return;
    }

    await markNotificationAsRead(userId, notificationId);

    res.status(200).json({ message: "알림을 읽음 처리했어요." });
  } catch (error) {
    next(error);
  }
}

/**
 * 알림 하나를 삭제합니다.
 */
export async function deleteNotification(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user!.userId;
    const { notificationId } = req.params;

    if (typeof notificationId !== "string" || notificationId.trim() === "") {
      res.status(400).json({ message: "notificationId가 올바르지 않아요." });
      return;
    }

    await removeNotification(userId, notificationId);

    res.status(200).json({ message: "알림을 삭제했어요." });
  } catch (error) {
    next(error);
  }
}
