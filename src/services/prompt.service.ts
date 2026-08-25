import mongoose from "mongoose";

import { ChatSessionModel } from "../models/chat-session.model.js";
import { PromptModel } from "../models/prompt.model.js";
import { DEFAULT_PROMPT_CONTENT } from "./ai/ai.prompt.js";
import {
  ActivatePromptResponse,
  ActivePromptResponse,
  CreatePromptResponse,
  PromptDetailResponse,
  PromptHistoryResponse,
} from "../schemas/prompt.schema.js";
import { AppError } from "../utils/AppError.js";

type PopulatedDeployer = { _id: mongoose.Types.ObjectId; nickname: string };

interface PromptStats {
  sessionCount: number;
  conversionRate: number;
}

/*
 * 소켓 이벤트 배선(session_created/conversion_event) 전까지는
 * chat_sessions에 prompt_version/last_stage가 채워지지 않아 항상 0건으로 집계됨.
 * 배선이 끝나면 이 함수는 그대로 둔 채 실제 값으로 채워짐
 */
async function getVersionStats(version: string): Promise<PromptStats> {
  const sessionCount = await ChatSessionModel.countDocuments({
    prompt_version: version,
  });

  if (sessionCount === 0) {
    return { sessionCount: 0, conversionRate: 0 };
  }

  const completedCount = await ChatSessionModel.countDocuments({
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

export const getPromptDetail = async (
  versionId: string,
): Promise<PromptDetailResponse> => {
  if (!mongoose.isValidObjectId(versionId)) {
    throw new AppError(404, "해당 버전을 찾을 수 없어요.");
  }

  const prompt = await PromptModel.findById(versionId)
    .populate<{ deployed_by: PopulatedDeployer }>("deployed_by", "nickname")
    .lean();

  if (!prompt) {
    throw new AppError(404, "해당 버전을 찾을 수 없어요.");
  }

  const stats = await getVersionStats(prompt.version);

  return {
    versionId: prompt._id.toString(),
    version: prompt.version,
    content: prompt.content,
    summary: prompt.summary,
    deployedAt: prompt.deployed_at,
    deployedBy: prompt.deployed_by.nickname,
    conversionRate: stats.conversionRate,
    sessionCount: stats.sessionCount,
    isActive: prompt.is_active,
    charCount: prompt.char_count,
  };
};

export const activatePromptVersion = async (
  versionId: string,
  adminId: string,
  adminName: string,
): Promise<ActivatePromptResponse> => {
  if (!mongoose.isValidObjectId(versionId)) {
    throw new AppError(404, "해당 버전을 찾을 수 없어요.");
  }

  const target = await PromptModel.findById(versionId);

  if (!target) {
    throw new AppError(404, "해당 버전을 찾을 수 없어요.");
  }

  if (target.is_active) {
    throw new AppError(400, "이미 활성화된 버전이에요.");
  }

  await PromptModel.updateMany(
    { is_active: true },
    { $set: { is_active: false } },
  );

  target.is_active = true;
  target.deployed_at = new Date();
  target.deployed_by = new mongoose.Types.ObjectId(adminId);
  await target.save();

  return {
    versionId: target._id.toString(),
    version: target.version,
    isActive: target.is_active,
    deployedAt: target.deployed_at,
    deployedBy: adminName,
    message: `${target.version} 버전이 활성화되었습니다.`,
  };
};

/*
 * 채팅 세션 생성 시점에 "지금 활성 프롬프트가 몇 버전인지"만 가볍게 조회하기 위한 함수.
 * 활성 프롬프트가 아예 없어도 채팅 자체는 계속 동작해야 하므로 에러를 던지지 않고 null을 반환함
 */
export const getActivePromptVersion = async (): Promise<string | null> => {
  const prompt = await PromptModel.findOne({ is_active: true })
    .select("version")
    .lean();

  return prompt?.version ?? null;
};

/*
 * 세션에 고정된 프롬프트 버전의 실제 내용을 조회함.
 * 해당 버전이 없으면 기본값으로 폴백해서 채팅이 멈추지 않게 함
 */
export const getPromptContentByVersion = async (
  version: string | null,
): Promise<string> => {
  if (version) {
    const prompt = await PromptModel.findOne({ version })
      .select("content")
      .lean();

    if (prompt) return prompt.content;
  }

  return DEFAULT_PROMPT_CONTENT;
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
