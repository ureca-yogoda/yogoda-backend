import type { UiEventElement } from "../models/ui-event.model.js";

export type StatsPeriod = "today" | "7d" | "30d";

export interface UiElementStat {
  element: UiEventElement;
  label: string;
  impressions: number;
  clicks: number;
  ctr: number;
  ctrChange: number;
  lowCtr: boolean;
}

export interface UiElementStatsResponse {
  totalImpressions: number;
  overallCtr: number;
  overallCtrChange: number;
  elements: UiElementStat[];
}
