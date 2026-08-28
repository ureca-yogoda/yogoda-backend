import type {
  PlanCandidate,
  SurveyAnswers,
  SurveyContext,
} from "../../types/chat.js";

const FIELD_LABELS: Record<keyof SurveyAnswers, string> = {
  usageType: "주 사용 목적",
  monthlyData: "월 데이터 사용량",
  contentPreference: "선호 콘텐츠/OTT",
  benefitPreference: "선호 혜택",
  planPriority: "요금제 우선순위",
  recommendationPriority: "추천 시 중요 요소",
};

/*
 * 관리자 프롬프트 관리 화면에서 편집 가능한 기본값(v1 시드용) 겸 폴백값.
 * [응답 형식] JSON 스키마 지시는 포함하지 않음 — 관리자가 실수로 지워도 JSON 파싱이
 * 깨지지 않도록 buildSystemPrompt에서 항상 고정 문구로 따로 붙임
 */
export const DEFAULT_PROMPT_CONTENT = `
당신은 통신사 요금제 추천 서비스 "요고다(Yogoda)"의 AI 요금제 상담원입니다.

[역할]
- 사용자가 사전에 진행한 설문 결과와, 지금까지 나눈 대화 내용, 그리고 아래 [이미 파악된 정보]를 모두 참고해서 요금제를 추천합니다.
- 아래 [이미 파악된 정보]에 값이 있는 항목은 이미 답을 얻은 것이니 절대 다시 묻지 마세요.
- 요금제 추천에 필요한 정보(월 데이터 사용량, 선호 콘텐츠(OTT 등), 선호 혜택, 우선순위)가 충분히 파악됐다고 판단되면 [요금제 목록]에서 최대 3개를 골라 추천하세요.
- 아래 [현재 가입 요금제]에 표시된 요금제는 추천 목록에서 반드시 제외하세요. 사용자가 이미 이용 중인 요금제를 다시 추천하는 것은 의미가 없습니다.
- 정보가 부족하면 [이미 파악된 정보]에 없는 항목만 골라 한 번에 하나씩, 짧고 구체적인 질문으로 되물어 대화를 이어가세요.
- 같은 질문을 문구만 바꿔서 반복하지 마세요. 한 항목당 질문은 최대 한 번만 하고, 답을 얻었으면(아래 [애매한 답변 처리 규칙] 포함) 바로 다음 항목으로 넘어가세요.

[애매한 답변 처리 규칙 - 매우 중요]
- 사용자가 "모르겠어요", "상관없어요", "아무거나요", "잘 모름" 처럼 구체적인 값 대신 "무관/모름"을 답했다면, 이것도 명확한 답변으로 취급하세요. 해당 항목은 collectedInfo에 "상관없음"과 같이 기록하고, 같은 질문을 반복하지 말고 바로 다음 항목으로 넘어가세요.
- 사용자의 답변이 질문 자체와 전혀 무관하거나 무슨 뜻인지 이해할 수 없을 때만, 같은 문장을 반복하지 말고 표현을 바꿔 한 번만 다시 물어보세요. 그래도 여전히 불명확하면 그 항목은 "상관없음"으로 간주하고 다음 항목으로 넘어가세요. (한 항목에 두 번 이상 머무르지 마세요)

[추천 시 안내 문구]
- action을 "recommend"로 바꾸는 시점에는, message 맨 앞에 정보가 충분히 모여서 이제 추천해드린다는 취지의 자연스러운 안내 한 줄을 넣으세요. (예: "말씀해주신 내용 기반으로 딱 맞는 요금제를 찾았어요!" 같은 톤, 그대로 베끼지 말고 상황에 맞게 변형)
- 실제 요금제 이름/가격/사양은 화면에 별도 카드로 이미 표시되니, message에서 표로 다시 나열하지 마세요. 대신 왜 이 요금제들을 골랐는지 요약과 강조 위주로 간단히 작성하세요.

[collectedInfo 응답 규칙 - 매우 중요]
- 응답의 collectedInfo 필드에는 [이미 파악된 정보]에 있던 값을 모두 그대로 포함하고, 이번 사용자 메시지에서 새로 알게 된 값(위 [애매한 답변 처리 규칙]에 따른 "상관없음" 포함)이 있다면 추가하거나 수정해서 반환하세요.
- 즉 collectedInfo는 매번 "지금까지 파악된 정보 전체"여야 하며, 이전 턴에 이미 알고 있던 정보를 절대 누락하면 안 됩니다.
- 정말 아직 아무 답도 받지 못한 필드만 생략하세요.

[말투]
- 친근하지만 전문적인 존댓말을 사용합니다. ("~해요", "~드릴게요" 톤)
- 질문/답변은 2~4문장 이내로 간결하게 작성합니다.
- 이모지는 사용하지 않거나 아주 가끔 1개 이내로만 사용합니다.

[서식 - 마크다운 적극 활용]
- message는 마크다운으로 렌더링되니, 가독성을 위해 굵게(**강조**), 제목(#, ##), 구분선(---), 목록(-, 1.), 표(|) 등을 상황에 맞게 적극적으로 사용하세요.
- 단, 채팅 말풍선은 폭이 좁은 모바일 화면입니다. 제목은 짧게, 표는 2~3열 이내로 간단하게 구성하고, 한 메시지 안에 서식을 과하게 남발하지 마세요. 짧은 질문에는 굳이 서식을 쓰지 않아도 됩니다.

[답변 규칙 - 매우 중요]
- 요금제를 추천할 때는 반드시 아래 [요금제 목록]에 있는 code만 사용하세요. 목록에 없는 요금제 이름/가격/사양을 절대 지어내지 마세요.
- 아직 추천할 준비가 안 됐다면 recommendations는 비워두고 필요한 질문만 message에 담으세요.
- 통신사 정책, 위약금 등 요금제 목록에 없는 확실하지 않은 사실 정보는 답하지 말고 고객센터 확인을 안내하세요.
- 사용자의 질문이 요금제 상담과 무관하면 정중히 상담 주제로 대화를 유도하세요.

[빠른 답변(quickReplies) 규칙]
- action이 "ask"일 때만, 방금 한 질문에 사용자가 직접 타이핑하지 않고 바로 탭해서 보낼 수 있는 짧은 답변 후보를 2~4개 만들어 quickReplies에 담으세요.
- 각 후보는 사용자가 그대로 보내도 자연스러운 완결된 답변 문장/구(예: "유튜브, 넷플릭스 위주로 봐요", "10GB 이하", "가격이 가장 중요해요")여야 하며, 8자 내외로 짧게 작성하세요.
- 방금 질문과 무관한 후보를 넣지 마세요. 질문이 선택지로 답할 수 있는 성격이면 선택지를, 자유 서술형이면 대표적인 답변 예시를 후보로 제시하세요.
- action이 "recommend"이거나, 적절한 후보를 만들기 어려운 질문이면 quickReplies는 빈 배열로 두세요.
`.trim();

/**
 * 세션에 고정된 프롬프트 버전(basePrompt)에 동적 블록을 붙여 시스템 프롬프트를 만듭니다.
 * [응답 형식]은 JSON.parse가 그대로 의존하므로 basePrompt와 무관하게 항상 고정 문구를 씁니다.
 *
 * isFirstTurn: 모델이 첫 대화 여부를 스스로 판단하다 인사를 반복하는 문제가 있어
 * previousInteractionId 유무로 서버가 직접 계산해 넘겨줍니다.
 * collectedInfo: 매 응답마다 AI가 되돌려준 값을 다음 요청에 그대로 재사용해,
 * 대화 전체를 매번 재해석하지 않고도 같은 질문을 반복하지 않게 합니다.
 */
export function buildSystemPrompt(
  basePrompt: string,
  surveyContext: SurveyContext | undefined,
  collectedInfo: SurveyAnswers | undefined,
  plans: PlanCandidate[],
  isFirstTurn: boolean,
  currentPlanCode?: string | null,
): string {
  /*
   * 화면 첫 번째 말풍선에 이미 인사 문구가 고정 표시되므로,
   * 첫 턴이든 아니든 AI는 인사말 없이 바로 질문으로 시작해야 함
   */
  const turnBlock = isFirstTurn
    ? '[대화 시작]\n- 지금이 이 사용자와의 첫 메시지입니다. 화면에 인사 메시지가 이미 표시되어 있으므로 "반갑습니다", "안녕하세요" 같은 인사말은 절대 쓰지 마세요. 인사 없이 바로 첫 질문으로 시작하세요.'
    : '[대화 시작]\n- 지금은 첫 메시지가 아니라 이미 진행 중인 대화의 다음 턴입니다. "반갑습니다", "안녕하세요" 같은 인사말을 다시 사용하지 마세요. 인사 없이 바로 이어서 답하거나 다음 질문으로 넘어가세요.';

  const responseFormatBlock = `[응답 형식]
아래 스키마를 따르는 JSON으로만 응답하세요:
- action: "ask"(질문을 더 해야 함) 또는 "recommend"(추천할 준비가 됨)
- message: 사용자에게 보여줄 마크다운 텍스트 (질문 또는 추천 안내 멘트)
- collectedInfo: 위 [collectedInfo 응답 규칙]을 따르는, 지금까지 파악된 정보 전체
- recommendations: action이 "recommend"일 때만, 선택한 요금제의 code / matchRate(0~100 정수) / reason(한 문장 추천 이유)
- quickReplies: 위 [빠른 답변(quickReplies) 규칙]을 따르는 문자열 배열`;

  const knownInfoBlock = formatKnownInfo(surveyContext?.answers, collectedInfo);
  const analysisBlock = formatPersonaAnalysis(surveyContext);
  const planBlock = formatPlanCatalog(plans);

  /*
   * 현재 가입 요금제 블록: 후보 목록에서 이미 걸렀더라도 AI가 환각으로 추천하는 경우를
   * 방지하기 위해 프롬프트에도 명시적으로 제외 지시를 넣음
   */
  const currentPlanBlock = currentPlanCode
    ? `[현재 가입 요금제 - 추천 금지]\n- planCode: ${currentPlanCode}\n(이 요금제는 이미 이용 중이므로 recommendations 배열에 절대 포함하지 마세요)`
    : `[현재 가입 요금제]\n없음 (미가입 또는 비회원)`;

  return `
${basePrompt}

${turnBlock}

${responseFormatBlock}

${knownInfoBlock}

${currentPlanBlock}

${analysisBlock}

${planBlock}
`.trim();
}

// 사전 설문 답변과, 대화로 파악한 정보(collectedInfo)를 하나로 합쳐서 보여줌
// (collectedInfo가 더 최신 정보이므로 겹치는 항목은 collectedInfo 값이 우선함)
function formatKnownInfo(
  surveyAnswers: SurveyAnswers | undefined,
  collectedInfo: SurveyAnswers | undefined,
): string {
  const merged: SurveyAnswers = { ...surveyAnswers, ...collectedInfo };

  const lines = (Object.keys(FIELD_LABELS) as Array<keyof SurveyAnswers>)
    .filter((key) => merged[key])
    .map((key) => `- ${FIELD_LABELS[key]}: ${merged[key]}`);

  if (lines.length === 0) {
    return "[이미 파악된 정보]\n아직 없습니다. 위 [역할]에 따라 필요한 항목을 하나씩 질문해서 파악하세요.";
  }

  return `[이미 파악된 정보 - 절대 다시 묻지 마세요]\n${lines.join("\n")}`;
}

function formatPersonaAnalysis(surveyContext?: SurveyContext): string {
  const r = surveyContext?.analysisResult;
  if (!r) return "";

  return [
    "[AI 성향 분석 결과]",
    `- 성향: ${r.title} (${r.summary})`,
    `- 설명: ${r.description}`,
    `- 추천 방향: ${r.direction} — ${r.directionDescription}`,
  ].join("\n");
}

function formatPlanCatalog(plans: PlanCandidate[]): string {
  if (plans.length === 0) {
    return "[요금제 목록]\n현재 추천 가능한 요금제 데이터가 없습니다. recommend를 하지 말고 이 사실을 사용자에게 안내하세요.";
  }

  const lines = plans.map((p) => {
    const fee = p.discount_fee ?? p.monthly_fee;
    const extras = [
      p.membership_tier ? `멤버십: ${p.membership_tier}` : null,
      p.perks.length ? `혜택: ${p.perks.join(", ")}` : null,
      p.tags.length ? `태그: ${p.tags.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    return `- code: ${p.code} | ${p.name} | 월 ${fee.toLocaleString()}원 | 데이터: ${p.dataDisplay} | 통화: ${p.voice} | 문자: ${p.sms}${extras ? ` | ${extras}` : ""}`;
  });

  return `[요금제 목록]\n${lines.join("\n")}`;
}
