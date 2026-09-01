import {
  UiEventModel,
  type UiEventAction,
  type UiEventElement,
} from "../models/ui-event.model.js";
import type {
  UiElementStat,
  UiElementStatsResponse,
} from "../schemas/ui-element.schema.js";
import {
  calculatePercentage,
  getPeriodRange,
  getPreviousRange,
  type DateRange,
  type StatsPeriod,
} from "../utils/stats.js";

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
  explore_plans: "다른 요금제 탐색하기",
};

const LOW_CTR_THRESHOLD = 30;

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

    const ctr = calculatePercentage(clicks, impressions);
    const prevCtr = calculatePercentage(prevClicks, prevImpressions);

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

  const overallCtr = calculatePercentage(totalClicks, totalImpressions);
  const prevOverallCtr = calculatePercentage(
    prevTotalClicks,
    prevTotalImpressions,
  );

  return {
    totalImpressions,
    overallCtr,
    overallCtrChange: Math.round((overallCtr - prevOverallCtr) * 10) / 10,
    elements,
  };
};
