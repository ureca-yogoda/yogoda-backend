import type { IPlanChoiceBenefit } from "../models/plan.model.js";
import { PlanModel } from "../models/plan.model.js";
import { UserModel } from "../models/user.model.js";
import { AppError } from "../utils/AppError.js";

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

  validateSelectedOptions(plan.choiceBenefits, selectedOptions);

  const joinedAt = new Date();

  const user = await UserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        current_plan_id: plan._id,
        current_plan_options: selectedOptions,
        plan_joined_at: joinedAt,
      },
    },
    {
      new: true,
    },
  );

  if (!user) {
    throw new AppError(404, "유저를 찾을 수 없어요.");
  }

  return {
    planCode: plan.code,
    planName: plan.name,
    currentPlanId: plan._id.toString(),
    selectedOptions,
    joinedAt,
  };
};
