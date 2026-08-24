import mongoose from "mongoose";

import { PromptModel } from "../models/prompt.model.js";
import {
  ActivePromptResponse,
  CreatePromptResponse,
  PromptHistoryResponse,
} from "../schemas/prompt.schema.js";
import { AppError } from "../utils/AppError.js";

type PopulatedDeployer = { _id: mongoose.Types.ObjectId; nickname: string };

interface PromptStats {
  sessionCount: number;
  conversionRate: number;
}

/*
 * chat_sessions는 아직 prompt_version/last_stage 필드가 모델에 없어(소켓 연동 작업 예정)
 * 컬렉션을 직접 조회함. 필드가 채워지기 전까지는 항상 0건으로 집계되고,
 * 이후 소켓 배선이 끝나면 별도 코드 변경 없이 실제 값으로 채워짐
 */
async function getVersionStats(version: string): Promise<PromptStats> {
  const chatSessions = mongoose.connection.collection("chat_sessions");

  const sessionCount = await chatSessions.countDocuments({
    prompt_version: version,
  });

  if (sessionCount === 0) {
    return { sessionCount: 0, conversionRate: 0 };
  }

  const completedCount = await chatSessions.countDocuments({
    prompt_version: version,
    last_stage: "signup_completed",
  });

  return {
    sessionCount,
    conversionRate: Math.round((completedCount / sessionCount) * 1000) / 10,
  };
}

function parseVersionNumber(version: string): number {
  const match = /^v(\d+)$/.exec(version);
  return match ? Number(match[1]) : 0;
}

async function getNextVersion(): Promise<string> {
  const prompts = await PromptModel.find().select("version").lean();
  const maxNumber = prompts.reduce(
    (max, prompt) => Math.max(max, parseVersionNumber(prompt.version)),
    0,
  );

  return `v${maxNumber + 1}`;
}

export const createAndDeployPrompt = async (
  content: string,
  summary: string,
  adminId: string,
  adminName: string,
): Promise<CreatePromptResponse> => {
  const version = await getNextVersion();

  await PromptModel.updateMany(
    { is_active: true },
    { $set: { is_active: false } },
  );

  const prompt = await PromptModel.create({
    version,
    content,
    summary,
    is_active: true,
    deployed_at: new Date(),
    deployed_by: adminId,
    char_count: content.length,
  });

  return {
    versionId: prompt._id.toString(),
    version: prompt.version,
    content: prompt.content,
    summary: prompt.summary,
    isActive: prompt.is_active,
    deployedAt: prompt.deployed_at,
    deployedBy: adminName,
  };
};

export const getPromptHistory = async (): Promise<PromptHistoryResponse> => {
  const prompts = await PromptModel.find()
    .sort({ deployed_at: 1 })
    .populate<{ deployed_by: PopulatedDeployer }>("deployed_by", "nickname")
    .lean();

  let prevConversionRate: number | null = null;
  const versions = [];

  for (const prompt of prompts) {
    const stats = await getVersionStats(prompt.version);
    const conversionRateChange =
      prevConversionRate === null
        ? null
        : Math.round((stats.conversionRate - prevConversionRate) * 10) / 10;

    versions.push({
      versionId: prompt._id.toString(),
      version: prompt.version,
      summary: prompt.summary,
      deployedAt: prompt.deployed_at,
      deployedBy: prompt.deployed_by.nickname,
      conversionRate: stats.conversionRate,
      conversionRateChange,
      sessionCount: stats.sessionCount,
      isActive: prompt.is_active,
    });

    prevConversionRate = stats.conversionRate;
  }

  // 최신 버전순으로 반환
  return { versions: versions.reverse() };
};

export const getActivePrompt = async (): Promise<ActivePromptResponse> => {
  const prompt = await PromptModel.findOne({ is_active: true })
    .populate<{ deployed_by: PopulatedDeployer }>("deployed_by", "nickname")
    .lean();

  if (!prompt) {
    throw new AppError(404, "활성 프롬프트가 없어요.");
  }

  const stats = await getVersionStats(prompt.version);

  return {
    versionId: prompt._id.toString(),
    version: prompt.version,
    content: prompt.content,
    isActive: prompt.is_active,
    deployedAt: prompt.deployed_at,
    deployedBy: prompt.deployed_by.nickname,
    conversionRate: stats.conversionRate,
    sessionCount: stats.sessionCount,
    charCount: prompt.char_count,
  };
};
