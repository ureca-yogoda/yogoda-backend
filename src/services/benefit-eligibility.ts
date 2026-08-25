const membershipRanks: Record<string, number> = {
  basic: 0,
  vip: 1,
  vvip: 2,
};

export interface BenefitEligibilityCondition {
  minMembershipTier?: string | null;
  minPlanMonthlyFee?: number | null;
  recommendedPlanCodes?: string[];
}

export interface UserPlanCondition {
  code: string;
  monthlyFee: number;
  membershipTier: string | null;
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
  const recommendedPlanCodes = benefit.recommendedPlanCodes ?? [];

  if (!plan) {
    return { eligible: false, reason: "요금제 가입 후 이용할 수 있어요." };
  }

  if (
    !meetsMembershipTier(plan.membershipTier, benefit.minMembershipTier ?? null)
  ) {
    return {
      eligible: false,
      reason: `${benefit.minMembershipTier} 멤버십부터 이용할 수 있어요.`,
    };
  }

  if (
    benefit.minPlanMonthlyFee != null &&
    plan.monthlyFee < benefit.minPlanMonthlyFee
  ) {
    return {
      eligible: false,
      reason: `월 ${benefit.minPlanMonthlyFee.toLocaleString("ko-KR")}원 이상 요금제에서 이용할 수 있어요.`,
    };
  }

  if (
    recommendedPlanCodes.length > 0 &&
    !recommendedPlanCodes.includes(plan.code)
  ) {
    return { eligible: false, reason: "현재 요금제에서는 제공되지 않아요." };
  }

  return { eligible: true, reason: "현재 요금제로 이용할 수 있어요." };
}
