import type { NextFunction, Request, Response } from "express";

import {
  findLatestAIChatSession,
  getSessionMessages,
} from "../../services/chat-history.service.js";

/**
 * 회원의 가장 최근 AI 채팅 세션과 전체 대화 내역을 조회합니다.
 * (로그인 사용자가 채팅 페이지에 들어올 때 이전 대화를 복원하기 위함)
 */
export async function getLatestSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user!.userId;
    const session = await findLatestAIChatSession(userId);

    if (!session) {
      res.status(200).json({
        session: null,
        messages: [],
        collectedInfo: null,
        previousInteractionId: null,
      });
      return;
    }

    const messages = await getSessionMessages(session._id.toString());

    res.status(200).json({
      session: {
        id: session._id.toString(),
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      },
      messages,
      collectedInfo: session.collected_info,
      previousInteractionId: session.last_interaction_id,
    });
  } catch (error) {
    next(error);
  }
}
