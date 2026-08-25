import {
  UiEventModel,
  type UiEventAction,
  type UiEventElement,
} from "../models/ui-event.model.js";
import type {
  StatsPeriod,
  UiElementStat,
  UiElementStatsResponse,
} from "../schemas/ui-element.schema.js";

export async function recordUiEvent(
  sessionId: string,
  element: UiEventElement,
  action: UiEventAction,
) {
  await UiEventModel.updateOne(
    { session_id: sessionId, element, action },
    { $setOnInsert: { session_id: sessionId, element, action } },
    { upsert: true },
  );
}

const ELEMENT_LABELS: Record<UiEventElement, string> = {
  plan_detail: "자세히 보기",
  plan_comparison: "요금제 비교",
  signup_button: "가입하기",
  benefit_detail: "혜택 자세히",
  agent_connect: "상담사 연결",
};

const LOW_CTR_THRESHOLD = 30;

interface DateRange {
  start: Date;
  end: Date;
}

// today는 오늘 00:00(UTC)부터 지금까지, 7d/30d는 지금부터 과거로 롤링 윈도우
function getPeriodRange(period: StatsPeriod): DateRange {
  const end = new Date();

  if (period === "today") {
    const start = new Date(end);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end };
  }

  const days = period === "7d" ? 7 : 30;
  return { start: new Date(end.getTime() - days * 24 * 60 * 60 * 1000), end };
}

// "전주 대비"를 기간 길이와 무관하게 일반화: 현재 조회 기간 바로 직전의 동일한 길이 구간
function getPreviousRange({ start, end }: DateRange): DateRange {
  const durationMs = end.getTime() - start.getTime();
  return { start: new Date(start.getTime() - durationMs), end: start };
}

async function countByAction(
  element: UiEventElement,
  action: UiEventAction,
  range: DateRange,
) {
  return UiEventModel.countDocuments({
    element,
    action,
    created_at: { $gte: range.start, $lt: range.end },
  });
}

function calculateCtr(clicks: number, impressions: number): number {
  if (impressions === 0) return 0;
  return Math.round((clicks / impressions) * 1000) / 10;
}

export const getUiElementStats = async (
  period: StatsPeriod,
): Promise<UiElementStatsResponse> => {
  const currentRange = getPeriodRange(period);
  const previousRange = getPreviousRange(currentRange);

  const elements: UiElementStat[] = [];
  let totalImpressions = 0;
  let totalClicks = 0;
  let prevTotalImpressions = 0;
  let prevTotalClicks = 0;

  for (const element of Object.keys(ELEMENT_LABELS) as UiEventElement[]) {
    const [impressions, clicks, prevImpressions, prevClicks] =
      await Promise.all([
        countByAction(element, "view", currentRange),
        countByAction(element, "click", currentRange),
        countByAction(element, "view", previousRange),
        countByAction(element, "click", previousRange),
      ]);

    const ctr = calculateCtr(clicks, impressions);
    const prevCtr = calculateCtr(prevClicks, prevImpressions);

    elements.push({
      element,
      label: ELEMENT_LABELS[element],
      impressions,
      clicks,
      ctr,
      ctrChange: Math.round((ctr - prevCtr) * 10) / 10,
      // 노출이 아예 없으면 "저성과"가 아니라 "데이터 없음"이므로 lowCtr로 잡지 않음
      lowCtr: impressions > 0 && ctr < LOW_CTR_THRESHOLD,
    });

    totalImpressions += impressions;
    totalClicks += clicks;
    prevTotalImpressions += prevImpressions;
    prevTotalClicks += prevClicks;
  }

  elements.sort((a, b) => a.ctr - b.ctr);

  const overallCtr = calculateCtr(totalClicks, totalImpressions);
  const prevOverallCtr = calculateCtr(prevTotalClicks, prevTotalImpressions);

  return {
    totalImpressions,
    overallCtr,
    overallCtrChange: Math.round((overallCtr - prevOverallCtr) * 10) / 10,
    elements,
  };
};
