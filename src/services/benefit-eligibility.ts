const membershipRanks: Record<string, number> = {
  basic: 0,
  vip: 1,
  vvip: 2,
};

export interface BenefitEligibilityCondition {
  minMembershipTier?: string | null;
  min_plan_monthly_fee?: number | null;
  recommended_plan_codes?: string[];
}

export interface UserPlanCondition {
  code: string;
  monthly_fee: number;
  membership_tier: string | null;
}

function normalizeMembershipTier(tier: string | null) {
  return tier?.trim().toLowerCase().replaceAll(" ", "") ?? "basic";
}

export function meetsMembershipTier(
  currentTier: string | null,
  minimumTier: string | null,
) {
  if (!minimumTier) {
    return true;
  }

  const currentRank = membershipRanks[normalizeMembershipTier(currentTier)];
  const minimumRank = membershipRanks[normalizeMembershipTier(minimumTier)];

  return (currentRank ?? 0) >= (minimumRank ?? 0);
}

export function evaluateBenefitEligibility(
  benefit: BenefitEligibilityCondition,
  plan: UserPlanCondition | null,
) {
  // 스키마 기본값 적용 전에 저장된 혜택 문서에는 배열 필드가 없을 수 있음
  const recommended_plan_codes = benefit.recommended_plan_codes ?? [];

  if (!plan) {
    return { eligible: false, reason: "요금제 가입 후 이용할 수 있어요." };
  }

  if (
    !meetsMembershipTier(
      plan.membership_tier,
      benefit.minMembershipTier ?? null,
    )
  ) {
    return {
      eligible: false,
      reason: `${benefit.minMembershipTier} 멤버십부터 이용할 수 있어요.`,
    };
  }

  if (
    benefit.min_plan_monthly_fee != null &&
    plan.monthly_fee < benefit.min_plan_monthly_fee
  ) {
    return {
      eligible: false,
      reason: `월 ${benefit.min_plan_monthly_fee.toLocaleString("ko-KR")}원 이상 요금제에서 이용할 수 있어요.`,
    };
  }

  if (
    recommended_plan_codes.length > 0 &&
    !recommended_plan_codes.includes(plan.code)
  ) {
    return { eligible: false, reason: "현재 요금제에서는 제공되지 않아요." };
  }

  return { eligible: true, reason: "현재 요금제로 이용할 수 있어요." };
}
