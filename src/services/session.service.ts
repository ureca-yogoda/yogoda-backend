import {
  ChatSessionModel,
  type ChatSessionFunnelStage,
} from "../models/chat-session.model.js";
import { UserModel } from "../models/user.model.js";
import type {
  SessionListItem,
  SessionListQuery,
  SessionListResponse,
} from "../schemas/session.schema.js";

const FUNNEL_STAGE_LABELS: Record<ChatSessionFunnelStage, string> = {
  consultation_started: "상담 시작 단계",
  recommendation_completed: "추천 완료 단계",
  plan_comparison_viewed: "요금제 비교 단계",
  signup_started: "가입 신청 단계",
  signup_completed: "가입 완료 단계",
};

// 관리자 화면에서 "종료된" 세션만 다루므로, 아직 진행 중인(status: null) 세션은 항상 제외함
function buildBaseFilter(query: SessionListQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    type: "AIChat",
    status: { $ne: null },
  };

  if (query.startDate || query.endDate) {
    const createdAtRange: { $gte?: Date; $lte?: Date } = {};
    if (query.startDate) {
      createdAtRange.$gte = new Date(`${query.startDate}T00:00:00.000Z`);
    }
    if (query.endDate) {
      createdAtRange.$lte = new Date(`${query.endDate}T23:59:59.999Z`);
    }
    filter.created_at = createdAtRange;
  }

  if (query.dropStage) {
    filter.last_stage = query.dropStage as ChatSessionFunnelStage;
  }

  if (query.promptVersion) {
    filter.prompt_version = query.promptVersion;
  }

  return filter;
}

export const getSessionList = async (
  query: SessionListQuery,
): Promise<SessionListResponse> => {
  const baseFilter = buildBaseFilter(query);

  const listFilter: Record<string, unknown> =
    query.status === "all"
      ? baseFilter
      : { ...baseFilter, status: query.status };

  const [totalCount, completedCount, droppedCount, sessions] =
    await Promise.all([
      ChatSessionModel.countDocuments(baseFilter),
      ChatSessionModel.countDocuments({ ...baseFilter, status: "completed" }),
      ChatSessionModel.countDocuments({ ...baseFilter, status: "dropped" }),
      ChatSessionModel.find(listFilter)
        .sort({ created_at: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
    ]);

  const userIds = [
    ...new Set(
      sessions
        .map((session) => session.user_id)
        .filter((userId): userId is string => userId !== null),
    ),
  ];

  const users = await UserModel.find({ _id: { $in: userIds } })
    .select("nickname")
    .lean();
  const nicknameByUserId = new Map(
    users.map((user) => [user._id.toString(), user.nickname]),
  );

  const items: SessionListItem[] = sessions.map((session) => {
    const isDropped = session.status === "dropped";

    return {
      sessionId: session._id.toString(),
      userName: session.user_id
        ? (nicknameByUserId.get(session.user_id) ?? "탈퇴한 회원")
        : "비회원",
      status: session.status as "completed" | "dropped",
      dropStage: isDropped ? session.last_stage : null,
      dropStageLabel:
        isDropped && session.last_stage
          ? FUNNEL_STAGE_LABELS[session.last_stage]
          : null,
      promptVersion: session.prompt_version,
      createdAt: session.created_at,
      duration: Math.round(
        (session.updated_at.getTime() - session.created_at.getTime()) / 1000,
      ),
    };
  });

  return {
    totalCount,
    completedCount,
    droppedCount,
    page: query.page,
    limit: query.limit,
    sessions: items,
  };
};
