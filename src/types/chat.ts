export interface SurveyAnswers {
  usageType?: string;
  monthlyData?: string;
  contentPreference?: string;
  benefitPreference?: string;
  budget?: string;
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
  monthly_fee: number;
  discount_fee: number | null;
  dataDisplay: string;
  voice: string;
  sms: string;
  membership_tier: string | null;
  perks: string[];
  tags: string[];
  recommendation_tags: string[];
}

export interface ChatRecommendation {
  code: string;
  matchRate: number;
  reason: string;
}

// ─── 가입 플로우 ───────────────────────────────────────────────────────────────

export type SignupStep =
  | "fraud_warning" // 개통 사기 예방 안내 확인
  | "terms_agreement" // 이용약관 동의
  | "identity_verification" // 본인인증 카드 (이름·생년월일·휴대폰 번호 + 인증번호)
  | "select_benefits" // 선택형 혜택 (choiceBenefits가 있는 요금제만)
  | "select_payment" // 요금납부 방법 선택
  | "final_confirm" // 가입 내용 최종 확인
  | "completed" // 가입 완료 → DB 업데이트
  | "paused"; // 사용자가 가입 단계와 무관한 이야기를 해서 잠시 대화를 벗어난 상태

/** AI가 가입 단계마다 수집·누적하는 정보 */
export interface SignupCollectedData {
  fraudWarningAcknowledged?: boolean;
  agreedToTerms?: boolean;
  identityVerified?: boolean;
  phoneNumber?: string;
  name?: string;
  birth?: string;
  /** choiceBenefit stepCode → 선택한 optionCode 배열 */
  selectedBenefits?: Record<string, string[]>;
  paymentMethod?: "계좌이체" | "신용카드";
  /** signupStep이 "paused"일 때, 재개하면 돌아갈 원래 단계 */
  pausedStep?: SignupStep;
}

// ─── AI 응답 ──────────────────────────────────────────────────────────────────

export interface ChatDecision {
  action: "ask" | "recommend" | "signup";
  message: string;
  /** 지금까지 대화로 파악된 정보 전체 (추천 플로우용) */
  collectedInfo?: SurveyAnswers;
  recommendations?: ChatRecommendation[];
  /** action이 "ask"일 때 빠른 답변 후보 */
  quickReplies?: string[];
  /** action이 "signup"일 때 현재 가입 단계 */
  signupStep?: SignupStep;
  /** action이 "signup"일 때 이 턴까지 누적된 가입 정보 전체 */
  signupData?: SignupCollectedData;
  /**
   * 일반 상담 중 사용자가 특정 요금제 가입 의사를 명확히 밝혔을 때만 채워짐.
   * (가입 플로우 전용 getSignupDecision이 아니라, 일반 상담 getChatDecision에서만 쓰임)
   */
  signupPlanCode?: string;
}
