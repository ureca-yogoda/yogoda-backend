import mongoose from "mongoose";

import { assertRequiredEnv, loadSecrets } from "../core/config/env.js";
import { connectDB } from "../core/db/mongoose.js";
import { BenefitModel } from "../models/benefit.model.js";

const schedules = [
  { code: "uplus-two-plus", calendar_day: 1 },
  { code: "uplus-cgv-benefit", calendar_day: 5 },
  { code: "uplus-baemin-benefit", calendar_day: 10 },
  { code: "uplus-oliveyoung-benefit", calendar_day: 15 },
  { code: "uplus-starbucks-benefit", calendar_day: 20 },
];

async function updateBenefitSchedules() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();
  for (const schedule of schedules) {
    await BenefitModel.updateOne(
      { code: schedule.code },
      { $set: { calendar_day: schedule.calendar_day } },
    );
  }
  await mongoose.connection.close();
  console.log(`✅ 월간 혜택 일정 ${schedules.length}건 갱신 완료`);
}

updateBenefitSchedules().catch(async (error: unknown) => {
  console.error("❌ 월간 혜택 일정 갱신 실패:", error);
  await mongoose.connection.close();
  process.exit(1);
});
