import type {
  PersonaAnswers,
  PersonaAnalysisResult,
} from "../types/persona.js";
import { personaAnswerOptions } from "../types/persona.js";
import { AppError } from "../utils/AppError.js";
import {
  analyzePersonaWithAI,
  type PersonaAnalysisLocale,
} from "./ai/ai.client.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAnswers(value: unknown): PersonaAnswers {
  if (!isRecord(value)) {
    throw new AppError(422, "설문 답변이 올바르지 않아요.");
  }

  const parsed = {} as PersonaAnswers;
  for (const [key, options] of Object.entries(personaAnswerOptions)) {
    const answer = value[key];
    if (
      typeof answer !== "string" ||
      !(options as readonly string[]).includes(answer)
    ) {
      throw new AppError(422, "설문 답변이 올바르지 않아요.");
    }
    (parsed as Record<string, string>)[key] = answer;
  }

  return parsed;
}

export async function analyzePersona(
  input: unknown,
): Promise<PersonaAnalysisResult> {
  if (!isRecord(input)) {
    throw new AppError(422, "요청 데이터가 올바르지 않아요.");
  }

  const answers = parseAnswers(input.answers);
  const locale: PersonaAnalysisLocale = input.locale === "en" ? "en" : "ko";

  try {
    return await analyzePersonaWithAI({ answers, locale });
  } catch (error) {
    console.error("페르소나 AI 분석 실패:", error);
    throw new AppError(
      503,
      "AI 분석을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  }
}
