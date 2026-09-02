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
import { getAllPromptVersionsSorted } from "./prompt.service.js";

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

// 단계별 인원수는 "그 단계 이상 도달"의 누적 집계임 (last_stage가 최고 도달 지점을 가리키므로)
async function getStageCounts(range: DateRange): Promise<number[]> {
  return Promise.all(
    FUNNEL_STAGES.map((_, index) =>
      countSessions(range, {
        last_stage: { $in: FUNNEL_STAGES.slice(index) },
      }),
    ),
  );
}

function getDropRates(stageCounts: number[]): (number | null)[] {
  return stageCounts.map((count, index) =>
    index === 0
      ? null
      : calculatePercentChange(count, stageCounts[index - 1] ?? 0),
  );
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

  // maxDropStage 선정 기준(베이스라인 대비 악화폭)의 베이스라인은 KPI와 동일하게
  // "바로 직전 동일 길이 구간"(previousRange)을 씀. 고정 기간(예: 30일)으로 하면
  // 그 필터를 고를 때 현재=베이스라인이 같아져서 편차가 항상 0이 되고, "오늘"처럼
  // 덜 익은 기간을 다 익은 기간과 비교하면 실제 이상 없이도 항상 나빠 보이는 문제가 있음
  const [stageCounts, baselineStageCounts] = await Promise.all([
    getStageCounts(currentRange),
    getStageCounts(previousRange),
  ]);

  const topCount = stageCounts[0] ?? 0;
  const baselineDropRates = getDropRates(baselineStageCounts);

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
      baselineDropRate: baselineDropRates[index] ?? null,
      baselineCount: baselineStageCounts[index] ?? 0,
    };
  });

  const lastStage = stages[stages.length - 1];
  const totalDropRate = lastStage
    ? Math.round((100 - lastStage.entryRate) * 10) / 10
    : 0;

  // "이번 기간 dropRate가 절대적으로 가장 큰 단계"가 아니라, "평소(베이스라인)보다
  // 얼마나 더 나빠졌는지"로 뽑음. 원래 마찰이 큰 단계(예: 본인인증)가 매번 1등으로
  // 고정되는 걸 막고, 실제 이상 신호가 있을 때만 배너가 뜨게 하기 위함
  let maxDropStage: ChatSessionFunnelStage | null = null;
  let maxDeterioration = 0;
  for (const stageInfo of stages) {
    if (stageInfo.dropRate === null || stageInfo.baselineDropRate === null) {
      continue;
    }

    const deterioration = stageInfo.dropRate - stageInfo.baselineDropRate;

    if (deterioration < maxDeterioration) {
      maxDeterioration = deterioration;
      maxDropStage = stageInfo.stage;
    }
  }

  // 버전별 전환율은 프롬프트 히스토리 계산을 그대로 재사용함 (기간과 무관한 버전 누적 실적)
  const versions = await getAllPromptVersionsSorted();
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
