import { PlanModel } from "../models/plan.model.js";

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
