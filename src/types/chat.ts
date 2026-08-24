export interface SurveyAnswers {
  usageType?: string;
  monthlyData?: string;
  contentPreference?: string;
  benefitPreference?: string;
  planPriority?: string;
  recommendationPriority?: string;
}

export interface SurveyAnalysisResult {
  type: string;
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

export interface SurveyContext {
  answers?: SurveyAnswers;
  analysisResult?: SurveyAnalysisResult | null;
  isSkipped?: boolean;
}

export interface PlanCandidate {
  code: string;
  name: string;
  category: string;
  monthlyFee: number;
  discountFee: number | null;
  dataDisplay: string;
  voice: string;
  sms: string;
  membershipTier: string | null;
  perks: string[];
  tags: string[];
  recommendationTags: string[];
}

export interface ChatRecommendation {
  code: string;
  matchRate: number;
  reason: string;
}

export interface ChatDecision {
  action: "ask" | "recommend";
  message: string;
  // 지금까지 대화로 파악된 정보 전체 (매 턴 누적/갱신됨) — 반복 질문을 막기 위해
  // 다음 요청의 시스템 프롬프트에 "이미 아는 정보"로 그대로 다시 실어 보냄
  collectedInfo?: SurveyAnswers;
  recommendations?: ChatRecommendation[];
  // action이 "ask"일 때, 사용자가 바로 탭해서 보낼 수 있는 짧은 답변 후보 (2~4개)
  quickReplies?: string[];
}
