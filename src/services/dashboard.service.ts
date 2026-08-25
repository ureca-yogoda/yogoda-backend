import {
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
} from "../constants/funnel-stage.js";
import {
  ChatSessionModel,
  type ChatSessionFunnelStage,
} from "../models/chat-session.model.js";
import type { DashboardResponse } from "../schemas/dashboard.schema.js";
import {
  calculatePercentChange,
  calculatePercentage,
  getPeriodRange,
  getPreviousRange,
  type DateRange,
  type StatsPeriod,
} from "../utils/stats.js";
import { getPromptHistory } from "./prompt.service.js";

// 관리자 화면은 "종료된" 세션만 다룸 (세션 목록/상세와 동일한 기준)
async function countSessions(
  range: DateRange,
  extraFilter: Record<string, unknown> = {},
) {
  return ChatSessionModel.countDocuments({
    type: "AIChat",
    status: { $ne: null },
    created_at: { $gte: range.start, $lt: range.end },
    ...extraFilter,
  });
}

function parseVersionNumber(version: string): number {
  const match = /^v(\d+)$/.exec(version);
  return match ? Number(match[1]) : 0;
}

export const getDashboard = async (
  period: StatsPeriod,
): Promise<DashboardResponse> => {
  const currentRange = getPeriodRange(period);
  const previousRange = getPreviousRange(currentRange);

  const [consultationCount, signupCount, consultationPrev, signupPrev] =
    await Promise.all([
      countSessions(currentRange, { last_stage: { $ne: null } }),
      countSessions(currentRange, { last_stage: "signup_completed" }),
      countSessions(previousRange, { last_stage: { $ne: null } }),
      countSessions(previousRange, { last_stage: "signup_completed" }),
    ]);

  const conversionRate = calculatePercentage(signupCount, consultationCount);
  const conversionRatePrev = calculatePercentage(signupPrev, consultationPrev);

  const kpi = {
    consultationCount,
    consultationChange: calculatePercentChange(
      consultationCount,
      consultationPrev,
    ),
    consultationPrev,
    signupCount,
    signupChange: calculatePercentChange(signupCount, signupPrev),
    signupPrev,
    conversionRate,
    conversionRateChange:
      Math.round((conversionRate - conversionRatePrev) * 10) / 10,
    conversionRatePrev,
  };

  // 단계별 인원수는 "그 단계 이상 도달"의 누적 집계임 (last_stage가 최고 도달 지점을 가리키므로)
  const stageCounts = await Promise.all(
    FUNNEL_STAGES.map((_, index) =>
      countSessions(currentRange, {
        last_stage: { $in: FUNNEL_STAGES.slice(index) },
      }),
    ),
  );

  const topCount = stageCounts[0] ?? 0;

  const stages = FUNNEL_STAGES.map((stage, index) => {
    const count = stageCounts[index] ?? 0;

    return {
      stage,
      label: FUNNEL_STAGE_LABELS[stage],
      count,
      entryRate: index === 0 ? 100 : calculatePercentage(count, topCount),
      dropRate:
        index === 0
          ? null
          : calculatePercentChange(count, stageCounts[index - 1] ?? 0),
    };
  });

  const lastStage = stages[stages.length - 1];
  const totalDropRate = lastStage
    ? Math.round((100 - lastStage.entryRate) * 10) / 10
    : 0;

  let maxDropStage: ChatSessionFunnelStage | null = null;
  let maxDropRate = 0;
  for (const stageInfo of stages) {
    if (stageInfo.dropRate !== null && stageInfo.dropRate < maxDropRate) {
      maxDropRate = stageInfo.dropRate;
      maxDropStage = stageInfo.stage;
    }
  }

  // 버전별 전환율은 프롬프트 히스토리 계산을 그대로 재사용함 (기간과 무관한 버전 누적 실적)
  const { versions } = await getPromptHistory();
  const promptConversion = versions
    .map((version) => ({
      version: version.version,
      conversionRate: version.conversionRate,
      sessionCount: version.sessionCount,
      isActive: version.isActive,
    }))
    .sort(
      (a, b) => parseVersionNumber(a.version) - parseVersionNumber(b.version),
    );

  return {
    kpi,
    funnel: { totalDropRate, maxDropStage, stages },
    promptConversion,
  };
};
