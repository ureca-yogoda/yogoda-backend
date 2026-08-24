import type { NextFunction, Request, Response } from "express";

import {
  endChatSession,
  findLatestAIChatSession,
  getSessionMessages,
  importGuestChatHistory,
  type GuestChatMessageInput,
} from "../../services/chat-history.service.js";
import type { SurveyAnswers } from "../../types/chat.js";
import { completeMissionFromAction } from "../../services/mission.service.js";

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
    await completeMissionFromAction(userId, "mission-ai-nerget-diagnosis");

    res.status(200).json({
      session: {
        id: session._id.toString(),
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        endedAt: session.ended_at,
      },
      messages,
      collectedInfo: session.collected_info,
      previousInteractionId: session.last_interaction_id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 회원이 "채팅 끝내기"를 눌러 현재 진행 중인 AI 채팅 세션을 종료합니다.
 * 대화 내역은 삭제하지 않고, 다음 접속 시 새 세션으로 시작하도록 표시만 합니다.
 */
export async function endSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user!.userId;
    const { sessionId } = req.body as { sessionId?: string };

    if (typeof sessionId !== "string" || sessionId.trim() === "") {
      res.status(400).json({ message: "sessionId가 올바르지 않아요." });
      return;
    }

    await endChatSession(userId, sessionId);

    res.status(200).json({ message: "채팅을 종료했어요." });
  } catch (error) {
    next(error);
  }
}

/**
 * 비회원(게스트) 상태에서 로컬 스토리지에 쌓인 대화 내역을 로그인 직후 회원 세션으로 이관합니다.
 * (소셜 로그인 콜백 성공 직후, 프론트가 게스트 대화 내역을 실어서 1회 호출함)
 */
export async function importGuestSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user!.userId;
    const {
      messages,
      collectedInfo,
      lastInteractionId,
    }: {
      messages?: GuestChatMessageInput[];
      collectedInfo?: SurveyAnswers;
      lastInteractionId?: string;
    } = req.body;

    const session = await importGuestChatHistory(
      userId,
      messages ?? [],
      collectedInfo,
      lastInteractionId,
    );

    if (!session) {
      res.status(200).json({ session: null });
      return;
    }

    res.status(200).json({
      session: {
        id: session._id.toString(),
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
}
