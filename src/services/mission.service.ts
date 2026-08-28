import { MissionModel } from "../models/mission.model.js";
import { UserMissionModel } from "../models/user-mission.model.js";
import { AppError } from "../utils/AppError.js";
import { addPoints, getPointWallet } from "./point.service.js";

export async function getMyMissions(userId: string) {
  const now = new Date();
  const missions = await MissionModel.find({
    is_active: true,
    status: "active",
    $and: [
      {
        $or: [{ start_date: null }, { start_date: { $lte: now } }],
      },
      { $or: [{ end_date: null }, { end_date: { $gte: now } }] },
    ],
  })
    .sort({ recommendation_weight: -1, sort_order: 1 })
    .lean();

  const records = await UserMissionModel.find({
    user_id: userId,
    mission_id: { $in: missions.map((mission) => mission._id) },
  }).lean();
  const recordMap = new Map(
    records.map((record) => [record.mission_id.toString(), record]),
  );

  const items = missions.map((mission) => {
    const record = recordMap.get(mission._id.toString());

    return {
      code: mission.code,
      title: mission.title,
      category: mission.category,
      summary: mission.summary,
      requirement: mission.requirement,
      reward: `${mission.reward_points}P`,
      rewardPoints: mission.reward_points,
      period: { startsAt: mission.start_date, endsAt: mission.end_date },
      status: record?.status ?? "available",
      progress: record?.progress ?? 0,
    };
  });

  const { balance: totalPoints } = await getPointWallet(userId);

  return {
    totalPoints,
    summary: {
      available: items.filter((mission) => mission.status === "available")
        .length,
      inProgress: items.filter((mission) => mission.status === "in_progress")
        .length,
      completed: items.filter((mission) => mission.status === "completed")
        .length,
      claimed: items.filter((mission) => mission.status === "claimed").length,
    },
    missions: items,
  };
}

async function findActiveMission(code: string) {
  const mission = await MissionModel.findOne({
    code,
    is_active: true,
    status: "active",
  });
  if (!mission) {
    throw new AppError(404, "미션을 찾을 수 없어요.");
  }
  return mission;
}

export async function joinMission(userId: string, code: string) {
  const mission = await findActiveMission(code);
  const record = await UserMissionModel.findOneAndUpdate(
    { user_id: userId, mission_id: mission._id },
    {
      $setOnInsert: {
        status: "in_progress",
        progress: 0,
        joined_at: new Date(),
      },
    },
    { returnDocument: "after", upsert: true },
  );
  return { code, status: record.status, progress: record.progress };
}

// 실제 행동 이벤트에서도 호출할 수 있도록 완료 처리를 서비스 함수로 분리함
export async function completeMissionFromAction(userId: string, code: string) {
  const mission = await findActiveMission(code);
  const existing = await UserMissionModel.findOne({
    user_id: userId,
    mission_id: mission._id,
  });
  if (existing?.status === "claimed") {
    return { code, status: existing.status, progress: existing.progress };
  }
  const record = await UserMissionModel.findOneAndUpdate(
    { user_id: userId, mission_id: mission._id },
    {
      $set: { status: "completed", progress: 100, completed_at: new Date() },
      $setOnInsert: { joined_at: new Date(), claimed_at: null },
    },
    { returnDocument: "after", upsert: true },
  );
  return { code, status: record.status, progress: record.progress };
}

export async function claimMissionReward(userId: string, code: string) {
  const mission = await findActiveMission(code);
  const record = await UserMissionModel.findOneAndUpdate(
    { user_id: userId, mission_id: mission._id, status: "completed" },
    { $set: { status: "claimed", claimed_at: new Date() } },
    { returnDocument: "after" },
  );
  if (!record) {
    throw new AppError(409, "완료한 미션의 보상만 받을 수 있어요.");
  }
  const points = mission.reward_points;
  await addPoints(userId, points, mission.title, `mission:${mission.code}`);
  return { code, status: record.status, points };
}
