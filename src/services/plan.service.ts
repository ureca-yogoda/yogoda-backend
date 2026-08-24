import type { IPlanChoiceBenefit } from "../models/plan.model.js";
import { PlanModel } from "../models/plan.model.js";
import { UserModel } from "../models/user.model.js";
import { AppError } from "../utils/AppError.js";
import {
  revokeAvailableCouponsForUser,
  syncEligibleCouponsForUser,
} from "./coupon.service.js";

type SelectedPlanOptions = Record<string, string[]>;

export const getPlans = async () => {
  return PlanModel.find({
    isActive: true,
  })
    .sort({
      sortOrder: 1,
      monthlyFee: 1,
    })
    .lean();
};

export const getPlanByCode = async (code: string) => {
  return PlanModel.findOne({
    code,
    isActive: true,
  }).lean();
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

  const newMonthlyFee = plan.discountFee ?? plan.monthlyFee;

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
  dependency: IPlanChoiceBenefit["dependsOn"][number],
  selectedOptions: SelectedPlanOptions,
) {
  const selectedCodes = selectedOptions[dependency.stepCode] ?? [];

  if (dependency.match === "all") {
    return dependency.optionCodes.every((optionCode) =>
      selectedCodes.includes(optionCode),
    );
  }

  return dependency.optionCodes.some((optionCode) =>
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
  if (step.dependsOn.length === 0) {
    return true;
  }

  return step.dependsOn.every((dependency) =>
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
  const choiceSteps = steps.filter((step) => step.stepType === "choice");

  const validStepCodes = new Set(choiceSteps.map((step) => step.code));

  for (const stepCode of Object.keys(selectedOptions)) {
    if (!validStepCodes.has(stepCode)) {
      throw new AppError(400, "유효하지 않은 혜택 선택 단계예요.");
    }
  }

  const sortedSteps = [...choiceSteps].sort(
    (a, b) => a.sortOrder - b.sortOrder,
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

    if (selectedCodes.length > step.selectionCount) {
      throw new AppError(400, "선택 가능한 혜택 개수를 초과했어요.");
    }

    if (step.required && selectedCodes.length !== step.selectionCount) {
      throw new AppError(400, "필수 혜택을 모두 선택해 주세요.");
    }

    if (
      !step.required &&
      selectedCodes.length > 0 &&
      selectedCodes.length !== step.selectionCount
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
    isActive: true,
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

  validateSelectedOptions(plan.choiceBenefits, selectedOptions);

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
      new: true,
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
    monthlyFee: plan.discountFee ?? plan.monthlyFee,
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
    isActive: true,
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
    .select("monthlyFee discountFee")
    .lean();

  const previousMonthlyFee = previousPlan
    ? (previousPlan.discountFee ?? previousPlan.monthlyFee)
    : null;

  validateSelectedOptions(plan.choiceBenefits, selectedOptions);

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
      new: true,
    },
  );

  if (!user) {
    throw new AppError(404, "유저를 찾을 수 없어요.");
  }

  // 기존 요금제 쿠폰을 회수한 뒤 변경된 요금제 기준으로 다시 발급함
  await revokeAvailableCouponsForUser(userId);
  await syncEligibleCouponsForUser(userId);

  const newMonthlyFee = plan.discountFee ?? plan.monthlyFee;

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
      new: true,
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
