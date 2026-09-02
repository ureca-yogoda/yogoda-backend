import type { ChatSessionFunnelStage } from "../models/chat-session.model.js";

export interface DashboardKpi {
  consultationCount: number;
  consultationChange: number;
  consultationPrev: number;
  signupCount: number;
  signupChange: number;
  signupPrev: number;
  conversionRate: number;
  conversionRateChange: number;
  conversionRatePrev: number;
}

export interface DashboardFunnelStage {
  stage: ChatSessionFunnelStage;
  label: string;
  count: number;
  entryRate: number;
  dropRate: number | null;
  // 바로 직전 동일 길이 구간(previousRange) 기준의 dropRate. maxDropStage는
  // 이 값 대비 이번 기간이 얼마나 더 나빠졌는지로 선정됨 (절대값 최대가 아님)
  baselineDropRate: number | null;
  // baselineDropRate를 계산한 표본 수. 이 값이 작으면 baselineDropRate 자체가
  // 신뢰하기 어려우니, 프론트에서 이 값 기준으로 배너/비교 표시 여부를 판단할 것
  baselineCount: number;
}

export interface DashboardFunnel {
  totalDropRate: number;
  maxDropStage: ChatSessionFunnelStage | null;
  stages: DashboardFunnelStage[];
}

export interface DashboardPromptConversion {
  version: string;
  conversionRate: number;
  sessionCount: number;
  isActive: boolean;
}

export interface DashboardResponse {
  kpi: DashboardKpi;
  funnel: DashboardFunnel;
  promptConversion: DashboardPromptConversion[];
}
