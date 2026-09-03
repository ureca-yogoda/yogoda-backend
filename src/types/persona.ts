export const personaAnswerOptions = {
  usageType: ["data", "benefit", "saving", "ai"],
  monthlyData: ["light", "normal", "heavy", "unlimited"],
  contentPreference: ["video", "sns", "game", "basic"],
  benefitPreference: ["membership", "ott", "coupon", "none"],
  planPriority: ["price", "balance", "benefits", "premium"],
  recommendationPriority: ["cheap", "data", "benefit", "balanced"],
} as const;

export type PersonaAnswers = {
  [
    K in keyof typeof personaAnswerOptions
  ]: (typeof personaAnswerOptions)[K][number];
};

export type PersonaAnalysisType =
  | "data_heavy"
  | "content_balanced"
  | "benefit_focused"
  | "saving_focused"
  | "balanced";

export interface PersonaAnalysisResult {
  type: PersonaAnalysisType;
  title: string;
  description: string;
  summary: string;
  scores: {
    data: number;
    content: number;
    benefit: number;
    price: number;
  };
  direction: string;
  directionDescription: string;
}
