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
