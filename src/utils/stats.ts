export type StatsPeriod = "today" | "7d" | "30d";

export interface DateRange {
  start: Date;
  end: Date;
}

// today는 오늘 00:00(UTC)부터 지금까지, 7d/30d는 지금부터 과거로 롤링 윈도우
export function getPeriodRange(period: StatsPeriod): DateRange {
  const end = new Date();

  if (period === "today") {
    const start = new Date(end);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end };
  }

  const days = period === "7d" ? 7 : 30;
  return { start: new Date(end.getTime() - days * 24 * 60 * 60 * 1000), end };
}

// "전일/전주 대비"를 기간 길이와 무관하게 일반화: 현재 조회 기간 바로 직전의 동일한 길이 구간
export function getPreviousRange({ start, end }: DateRange): DateRange {
  const durationMs = end.getTime() - start.getTime();
  return { start: new Date(start.getTime() - durationMs), end: start };
}

// 분모가 0이면 0으로 처리해 NaN/Infinity를 피함 (예: CTR, 진입률, 전환율)
export function calculatePercentage(
  numerator: number,
  denominator: number,
): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

// 이전 값 대비 증감률. 이전 값이 0이면 비교 기준이 없으므로 0으로 처리함
export function calculatePercentChange(current: number, previous: number) {
  return calculatePercentage(current - previous, previous);
}
