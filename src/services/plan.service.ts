import type { IPlanChoiceBenefit } from "../models/plan.model.js";
import { PlanModel } from "../models/plan.model.js";
import { UserModel } from "../models/user.model.js";
import { AppError } from "../utils/AppError.js";
import { toCamelCaseDeep } from "../utils/case.js";
import {
  revokeAvailableCouponsForUser,
  syncEligibleCouponsForUser,
} from "./coupon.service.js";

type SelectedPlanOptions = Record<string, string[]>;

export const getPlans = async () => {
  const plans = await PlanModel.find({
    is_active: true,
  })
    .sort({
      sort_order: 1,
      monthly_fee: 1,
    })
    .lean();
  return toCamelCaseDeep(plans);
};

export const getPlanByCode = async (code: string) => {
  const plan = await PlanModel.findOne({
    code,
    is_active: true,
  }).lean();
  return plan ? toCamelCaseDeep(plan) : null;
};

export interface PlanSavings {
  amount: number;
  previousMonthlyFee: number;
  newMonthlyFee: number;
}

/*
 * 이전 요금제 월정액과 새 요금제 월정액을 비교해 절약 금액을 계산함
 * 이전 요금제 정보가 없으면(최초 가입) null을 반환함
 */
function calculateSavings(
  previousMonthlyFee: number | null | undefined,
  newMonthlyFee: number,
): PlanSavings | null {
  if (previousMonthlyFee === null || previousMonthlyFee === undefined) {
    return null;
  }

  return {
    amount: previousMonthlyFee - newMonthlyFee,
    previousMonthlyFee,
    newMonthlyFee,
  };
}

/*
 * 로그인한 사용자의 현재 가입 요금제와 선택 혜택을 조회함
 * 가입한 요금제가 없는 사용자는 null을 반환함
 */
export const getCurrentPlan = async (userId: string) => {
  const user = await UserModel.findById(userId)
    .select(
      "current_plan_id current_plan_options plan_joined_at previous_monthly_fee",
    )
    .lean();

  if (!user) {
    throw new AppError(404, "유저를 찾을 수 없어요.");
  }

  if (!user.current_plan_id) {
    return null;
  }

  const plan = await PlanModel.findById(user.current_plan_id).lean();

  if (!plan) {
    return null;
  }

  const newMonthlyFee = plan.discount_fee ?? plan.monthly_fee;

  return {
    planCode: plan.code,
    planName: plan.name,
    currentPlanId: plan._id.toString(),
    selectedOptions: user.current_plan_options ?? {},
    joinedAt: user.plan_joined_at,
    monthlyFee: newMonthlyFee,
    savings: calculateSavings(user.previous_monthly_fee, newMonthlyFee),
  };
};

/*
 * 특정 선택 단계의 의존 조건이 충족됐는지 확인함
 * all은 모든 옵션, any는 하나 이상의 옵션 선택이 필요함
 */
function isDependencySatisfied(
  dependency: IPlanChoiceBenefit["depends_on"][number],
  selectedOptions: SelectedPlanOptions,
) {
  const selectedCodes = selectedOptions[dependency.step_code] ?? [];

  if (dependency.match === "all") {
    return dependency.option_codes.every((optionCode) =>
      selectedCodes.includes(optionCode),
    );
  }

  return dependency.option_codes.some((optionCode) =>
    selectedCodes.includes(optionCode),
  );
}

/*
 * 선행 혜택 선택에 따라 현재 단계를 실제로 선택할 수 있는지 확인함
 */
function isStepEligible(
  step: IPlanChoiceBenefit,
  selectedOptions: SelectedPlanOptions,
) {
  if (step.depends_on.length === 0) {
    return true;
  }

  return step.depends_on.every((dependency) =>
    isDependencySatisfied(dependency, selectedOptions),
  );
}

/*
 * 프론트에서 전달된 선택 혜택을 서버 데이터 기준으로 다시 검증함
 * 클라이언트 검증만 신뢰하지 않고 단계, 옵션, 선택 개수, 의존성을 모두 확인함
 */
function validateSelectedOptions(
  steps: IPlanChoiceBenefit[],
  selectedOptions: SelectedPlanOptions,
) {
  const choiceSteps = steps.filter((step) => step.step_type === "choice");

  const validStepCodes = new Set(choiceSteps.map((step) => step.code));

  for (const step_code of Object.keys(selectedOptions)) {
    if (!validStepCodes.has(step_code)) {
      throw new AppError(400, "유효하지 않은 혜택 선택 단계예요.");
    }
  }

  const sortedSteps = [...choiceSteps].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  for (const step of sortedSteps) {
    const selectedCodes = selectedOptions[step.code] ?? [];
    const eligible = isStepEligible(step, selectedOptions);

    if (!eligible) {
      if (selectedCodes.length > 0) {
        throw new AppError(400, "선택할 수 없는 혜택이 포함되어 있어요.");
      }

      continue;
    }

    const uniqueSelectedCodes = new Set(selectedCodes);

    if (uniqueSelectedCodes.size !== selectedCodes.length) {
      throw new AppError(400, "중복된 혜택이 선택되어 있어요.");
    }

    const validOptionCodes = new Set(step.options.map((option) => option.code));

    const hasInvalidOption = selectedCodes.some(
      (optionCode) => !validOptionCodes.has(optionCode),
    );

    if (hasInvalidOption) {
      throw new AppError(400, "유효하지 않은 혜택이 선택되어 있어요.");
    }

    if (selectedCodes.length > step.selection_count) {
      throw new AppError(400, "선택 가능한 혜택 개수를 초과했어요.");
    }

    if (step.required && selectedCodes.length !== step.selection_count) {
      throw new AppError(400, "필수 혜택을 모두 선택해 주세요.");
    }

    if (
      !step.required &&
      selectedCodes.length > 0 &&
      selectedCodes.length !== step.selection_count
    ) {
      throw new AppError(400, "선택한 혜택의 개수를 확인해 주세요.");
    }
  }
}

/*
 * 아직 요금제가 없는 사용자의 최초 가입을 처리함
 * 이미 요금제를 이용 중이라면 변경 API를 사용해야 함
 */
export const joinPlan = async (
  userId: string,
  code: string,
  selectedOptions: SelectedPlanOptions,
) => {
  const plan = await PlanModel.findOne({
    code,
    is_active: true,
  }).lean();

  if (!plan) {
    throw new AppError(404, "요금제를 찾을 수 없어요.");
  }

  const currentUser = await UserModel.findById(userId)
    .select("current_plan_id")
    .lean();

  if (!currentUser) {
    throw new AppError(404, "유저를 찾을 수 없어요.");
  }

  if (currentUser.current_plan_id) {
    if (currentUser.current_plan_id.equals(plan._id)) {
      throw new AppError(409, "이미 이용 중인 요금제예요.");
    }

    throw new AppError(
      409,
      "이미 이용 중인 요금제가 있어요. 요금제 변경을 이용해 주세요.",
    );
  }

  validateSelectedOptions(plan.choice_benefits, selectedOptions);

  const joinedAt = new Date();

  const user = await UserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        current_plan_id: plan._id,
        current_plan_options: selectedOptions,
        plan_joined_at: joinedAt,
        // 최초 가입은 비교할 이전 요금제가 없으므로 절약 금액을 계산하지 않음
        previous_monthly_fee: null,
      },
    },
    {
      returnDocument: "after",
    },
  );

  if (!user) {
    throw new AppError(404, "유저를 찾을 수 없어요.");
  }

  await syncEligibleCouponsForUser(userId);

  return {
    planCode: plan.code,
    planName: plan.name,
    currentPlanId: plan._id.toString(),
    selectedOptions,
    joinedAt,
    monthlyFee: plan.discount_fee ?? plan.monthly_fee,
    savings: null,
  };
};

/*
 * 기존 요금제를 이용 중인 사용자의 요금제를 다른 요금제로 변경함
 * 현재 이용 중인 동일 요금제로는 변경할 수 없음
 */
export const changePlan = async (
  userId: string,
  code: string,
  selectedOptions: SelectedPlanOptions,
) => {
  const plan = await PlanModel.findOne({
    code,
    is_active: true,
  }).lean();

  if (!plan) {
    throw new AppError(404, "요금제를 찾을 수 없어요.");
  }

  const currentUser = await UserModel.findById(userId)
    .select("current_plan_id")
    .lean();

  if (!currentUser) {
    throw new AppError(404, "유저를 찾을 수 없어요.");
  }

  if (!currentUser.current_plan_id) {
    throw new AppError(
      409,
      "현재 이용 중인 요금제가 없어요. 요금제 가입을 이용해 주세요.",
    );
  }

  if (currentUser.current_plan_id.equals(plan._id)) {
    throw new AppError(409, "이미 이용 중인 요금제예요.");
  }

  // 절약 금액 계산을 위해 변경 전 요금제의 실제 청구액을 미리 조회함
  const previousPlan = await PlanModel.findById(currentUser.current_plan_id)
    .select("monthly_fee discount_fee")
    .lean();

  const previousMonthlyFee = previousPlan
    ? (previousPlan.discount_fee ?? previousPlan.monthly_fee)
    : null;

  validateSelectedOptions(plan.choice_benefits, selectedOptions);

  const changedAt = new Date();

  const user = await UserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        current_plan_id: plan._id,
        current_plan_options: selectedOptions,
        plan_joined_at: changedAt,
        previous_monthly_fee: previousMonthlyFee,
      },
    },
    {
      returnDocument: "after",
    },
  );

  if (!user) {
    throw new AppError(404, "유저를 찾을 수 없어요.");
  }

  // Reconcile eligibility without revoking purchased or still-eligible coupons.
  await syncEligibleCouponsForUser(userId);

  const newMonthlyFee = plan.discount_fee ?? plan.monthly_fee;

  return {
    planCode: plan.code,
    planName: plan.name,
    currentPlanId: plan._id.toString(),
    selectedOptions,
    joinedAt: changedAt,
    monthlyFee: newMonthlyFee,
    savings: calculateSavings(previousMonthlyFee, newMonthlyFee),
  };
};

/*
 * 현재 이용 중인 요금제를 해지함
 * 해지 후 홈/혜택에서 가입 요금제가 없는 상태로 조회되도록 관련 필드를 초기화함
 */
export const cancelCurrentPlan = async (userId: string) => {
  const currentUser = await UserModel.findById(userId)
    .select("current_plan_id")
    .lean();

  if (!currentUser) {
    throw new AppError(404, "유저를 찾을 수 없어요.");
  }

  if (!currentUser.current_plan_id) {
    throw new AppError(409, "현재 이용 중인 요금제가 없어요.");
  }

  const user = await UserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        current_plan_id: null,
        current_plan_options: {},
        plan_joined_at: null,
        previous_monthly_fee: null,
      },
    },
    {
      returnDocument: "after",
    },
  );

  if (!user) {
    throw new AppError(404, "유저를 찾을 수 없어요.");
  }

  await revokeAvailableCouponsForUser(userId);

  return {
    canceledPlanId: currentUser.current_plan_id.toString(),
  };
};

// ─── 채팅 가입 플로우 ───────────────────────────────────────────────────────────

export interface SubscribePlanParams {
  userId: string;
  planCode: string;
  selectedOptions: Record<string, string[]>;
  signupType?: "신규가입" | "번호이동";
  paymentMethod: "계좌이체" | "신용카드" | "카카오페이" | "네이버페이" | "토스";
}

export interface SubscribePlanResult {
  planCode: string;
  planName: string;
  currentPlanId: string;
  selectedOptions: Record<string, string[]>;
  joinedAt: Date;
  monthlyFee: number;
  savings: PlanSavings | null;
  signupType?: "신규가입" | "번호이동";
  paymentMethod: "계좌이체" | "신용카드" | "카카오페이" | "네이버페이" | "토스";
}

/**
 * 채팅 가입 플로우 완료 시 호출합니다.
 * changePlan과 달리 현재 요금제가 없어도(최초 가입) 동작하며,
 * signup_type / payment_method도 함께 저장합니다.
 */
export const subscribeUserToPlan = async ({
  userId,
  planCode,
  selectedOptions,
  signupType,
  paymentMethod,
}: SubscribePlanParams): Promise<SubscribePlanResult> => {
  const [currentUser, plan] = await Promise.all([
    UserModel.findById(userId)
      .select("current_plan_id previous_monthly_fee")
      .lean(),
    PlanModel.findOne({ code: planCode, is_active: true }).lean(),
  ]);

  if (!currentUser) throw new AppError(404, "유저를 찾을 수 없어요.");
  if (!plan) throw new AppError(404, "해당 요금제를 찾을 수 없어요.");

  if (currentUser.current_plan_id?.toString() === plan._id.toString()) {
    throw new AppError(409, "이미 이용 중인 요금제예요.");
  }

  // 이전 요금제가 있는 경우 절약 금액 계산용 금액 조회
  let previousMonthlyFee: number | null = null;
  if (currentUser.current_plan_id) {
    const previousPlan = await PlanModel.findById(currentUser.current_plan_id)
      .select("monthly_fee discount_fee")
      .lean();
    previousMonthlyFee = previousPlan
      ? (previousPlan.discount_fee ?? previousPlan.monthly_fee)
      : null;
  }

  validateSelectedOptions(plan.choice_benefits, selectedOptions);

  const joinedAt = new Date();

  const updatedUser = await UserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        current_plan_id: plan._id,
        current_plan_options: selectedOptions,
        plan_joined_at: joinedAt,
        previous_monthly_fee: previousMonthlyFee,
        signup_type: signupType,
        payment_method: paymentMethod,
      },
    },
    { returnDocument: "after" },
  );

  if (!updatedUser) throw new AppError(404, "유저를 찾을 수 없어요.");

  await syncEligibleCouponsForUser(userId);

  const newMonthlyFee = plan.discount_fee ?? plan.monthly_fee;

  return {
    planCode: plan.code,
    planName: plan.name,
    currentPlanId: plan._id.toString(),
    selectedOptions,
    joinedAt,
    monthlyFee: newMonthlyFee,
    savings: calculateSavings(previousMonthlyFee, newMonthlyFee),
    signupType,
    paymentMethod,
  };
};

export interface SaveVerifiedIdentityParams {
  userId: string;
  name: string;
  birth: string;
  phoneNumber: string;
}

/**
 * 가입 플로우의 본인인증 카드에서 이름·생년월일·휴대폰 번호 인증이 끝나면
 * 즉시 호출합니다. 최종 가입 완료를 기다리지 않고 바로 유저 문서에 저장해서,
 * 이후 단계(혜택 선택 등)에서 이탈해도 확인한 개인정보는 남습니다.
 */
export const saveVerifiedIdentity = async ({
  userId,
  name,
  birth,
  phoneNumber,
}: SaveVerifiedIdentityParams): Promise<void> => {
  const updated = await UserModel.findByIdAndUpdate(userId, {
    $set: {
      real_name: name,
      birth_date: birth,
      phone_number: phoneNumber,
      identity_verified_at: new Date(),
    },
  });

  if (!updated) throw new AppError(404, "유저를 찾을 수 없어요.");
};
