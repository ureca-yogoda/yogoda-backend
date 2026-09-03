export type StatsPeriod = "today" | "7d" | "30d";

export interface DateRange {
  start: Date;
  end: Date;
}

// DB엔 항상 UTC로 저장되지만, 관리자가 보는 기간은 한국 시간(KST, UTC+9) 기준
// 날짜 경계여야 함. UTC 자정으로 계산하면 KST로 오전 9시가 하루의 시작이 되어버림
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// setUTCHours는 UTC 자정만 구할 수 있어서, 9시간 밀었다 자정으로 자르고
// 다시 되돌리는 방식으로 KST 자정을 구함
function getKstMidnight(date: Date): Date {
  const kstShifted = new Date(date.getTime() + KST_OFFSET_MS);
  kstShifted.setUTCHours(0, 0, 0, 0);
  return new Date(kstShifted.getTime() - KST_OFFSET_MS);
}

// 세 프리셋 모두 "오늘 포함 최근 N개 KST 날짜 00:00부터 지금까지"로 통일
// (today=1일치, 7d=7일치, 30d=30일치)
export function getPeriodRange(period: StatsPeriod): DateRange {
  const end = new Date();
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const todayMidnight = getKstMidnight(end);
  const start = new Date(
    todayMidnight.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
  );

  return { start, end };
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
