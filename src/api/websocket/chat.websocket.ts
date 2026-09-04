import { Server, Socket } from "socket.io";
import { consumeChatQuota } from "../../core/middlewares/rate-limit.js";
import {
  assertSignupReady,
  validateIdentityInput,
} from "../../services/signup-validation.js";

import { env } from "../../core/config/env.js";
import { FUNNEL_STAGES } from "../../constants/funnel-stage.js";
import { verifyAccessToken } from "../../core/security/jwt.js";
import type { ChatSessionFunnelStage } from "../../models/chat-session.model.js";
import type {
  UiEventAction,
  UiEventElement,
} from "../../models/ui-event.model.js";
import {
  getChatDecision,
  getSignupDecision,
} from "../../services/ai/ai.client.js";
import {
  finalizeSessionStatus,
  recordChatLogConsent,
  recordConversionEvent,
  resolveChatSession,
  saveMessage,
  updateCollectedInfo,
  updateLastInteractionId,
  updateSignupCollectedData,
} from "../../services/chat-history.service.js";
import {
  getCurrentPlan,
  getPlanByCode,
  saveVerifiedIdentity,
  subscribeUserToPlan,
} from "../../services/plan.service.js";
import { getPromptContentByVersion } from "../../services/prompt.service.js";
import {
  buildPlanCards,
  getPlanCandidates,
} from "../../services/plan-recommendation.service.js";
import { recordUiEvent } from "../../services/ui-event.service.js";
import type {
  SurveyAnswers,
  SurveyContext,
  SignupCollectedData,
  SignupStep,
} from "../../types/chat.js";

interface ChatMessagePayload {
  message?: string;
  simulateError?: boolean;
  surveyContext?: SurveyContext;
  // 가입 플로우 전용
  preselectedPlanCode?: string;
  // 이 요금제가 이 세션에서 AI가 실제로 추천한 것인지 여부. 요금제 탐색 페이지에서
  // 혼자 찾은 요금제로 가입을 시도해도 preselectedPlanCode 자체는 똑같이 오기 때문에,
  // 퍼널(가입 전환) 집계를 "AI 추천으로 인한 전환"만으로 한정하려면 이 값으로 걸러야 함
  recommendedByAI?: boolean;
  isKickoff?: boolean;
  signupCollectedData?: SignupCollectedData;
  // 이번 메시지를 보내기 직전, 프론트가 알고 있던 가입 단계. 약관 동의처럼
  // 지정된 버튼으로만 다음 단계로 넘어가야 하는 단계를 서버가 결정론적으로
  // 지키기 위한 기준값으로 사용함 (AI 판단만으로는 애매한 텍스트도 동의로 오판할 수 있음)
  currentSignupStep?: string;
  // 본인 확인 카드에서 입력한 원본 값. message에는 AI가 읽을 수 있게 자연어 문장으로도
  // 같은 내용을 담아 보내지만, DB에는 원문 대신 이 구조화된 JSON을 저장함 (나중에
  // 필요할 때 문자열 파싱 없이 바로 가공할 수 있도록)
  identityVerification?: {
    name: string;
    birth: string;
    phoneNumber: string;
  };
}

interface ChatSocketAuth {
  token?: string;
  sessionId?: string;
}

interface ConversionEventPayload {
  sessionId?: string;
  event?: string;
}

interface SignupEntryPayload {
  text?: string;
  planCode?: string;
}

interface ConsentPayload {
  consented?: boolean;
}

// 가입 플로우 단계의 정해진 순서. AI가 자유 판단으로 다음 단계를 정하는 지점(예:
// fraud_warning 긍정/부정 판단, select_benefits/select_payment 완료 판단)에서, 판단
// 자체는 AI에게 맡기더라도 "다음 단계로 간다"는 결론이면 반드시 이 순서상 바로
// 다음 단계로만 가도록 강제함 — 한 턴에 여러 단계를 한꺼번에 건너뛰는(예: 본인인증
// 완료 정보를 지어내며 최종확인까지 바로 점프) 사고가 실제로 있었음
const SIGNUP_STEP_ORDER: SignupStep[] = [
  "fraud_warning",
  "terms_agreement",
  "identity_verification",
  "select_benefits",
  "select_payment",
  "final_confirm",
  "completed",
];

function isFunnelStage(value: unknown): value is ChatSessionFunnelStage {
  return (
    typeof value === "string" && (FUNNEL_STAGES as string[]).includes(value)
  );
}

interface UiEventPayload {
  sessionId?: string;
  element?: string;
  action?: string;
}

const UI_EVENT_ELEMENTS: UiEventElement[] = [
  "plan_detail",
  "plan_comparison",
  "signup_button",
  "explore_plans",
];

const UI_EVENT_ACTIONS: UiEventAction[] = ["view", "click"];

function isUiEventElement(value: unknown): value is UiEventElement {
  return (
    typeof value === "string" && (UI_EVENT_ELEMENTS as string[]).includes(value)
  );
}

function isUiEventAction(value: unknown): value is UiEventAction {
  return (
    typeof value === "string" && (UI_EVENT_ACTIONS as string[]).includes(value)
  );
}

type ChoiceBenefitLike = {
  code: string;
  title: string;
  options: { code: string; title: string }[];
};

/**
 * 선택형 혜택의 선택지 code를 사람이 읽을 수 있는 제목으로 바꿔줌 (카테고리 제목 →
 * 선택한 옵션 제목 목록). 최종 확인 카드 표시, 현재 가입 요금제 안내(프롬프트) 양쪽에서
 * 재사용됨
 */
function resolveSelectedBenefitTitles(
  selectedOptions: Record<string, string[]> | undefined,
  choiceBenefits: ChoiceBenefitLike[] | undefined,
): Record<string, string[]> {
  if (!selectedOptions) return {};

  const resolved: Record<string, string[]> = {};
  for (const [stepCode, optionCodes] of Object.entries(selectedOptions)) {
    const step = (choiceBenefits ?? []).find((b) => b.code === stepCode);
    const stepLabel = step?.title ?? stepCode;
    resolved[stepLabel] = optionCodes.map(
      (optionCode) =>
        step?.options.find((o) => o.code === optionCode)?.title ?? optionCode,
    );
  }
  return resolved;
}

function resolveConnectionUserId(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = verifyAccessToken(token);
    return (payload.userId as string | undefined) ?? null;
  } catch (err) {
    console.error("소켓 토큰 검증 실패, 비회원으로 처리합니다:", err);
    return null;
  }
}

/**
 * 사용자 메시지와 현재 가입 단계를 기반으로 로딩 중 표시할 안내 문구를 반환함.
 * AI 호출 전에 즉시 emit해 로딩 체감을 줄임.
 */
function getThinkingMessage(
  message: string,
  signupStep?: string | null,
): string {
  if (signupStep) {
    const map: Record<string, string> = {
      fraud_warning: "개통 안내를 준비하고 있어요",
      terms_agreement: "약관 내용을 불러오고 있어요",
      identity_verification: "본인인증 결과를 확인하고 있어요",
      select_benefits: "혜택 옵션을 정리하고 있어요",
      select_payment: "납부 방법을 확인하고 있어요",
      final_confirm: "가입 정보를 정리하고 있어요",
      completed: "가입을 처리하고 있어요",
    };
    const msg = map[signupStep];
    if (msg) return msg;
  }

  const m = message;
  if (/비교/.test(m)) return "요금제를 비교하고 있어요";
  if (/추천/.test(m)) return "딱 맞는 요금제를 찾고 있어요";
  if (/가입/.test(m)) return "가입 정보를 확인하고 있어요";
  if (/데이터|용량/.test(m)) return "데이터 요금제를 살펴보고 있어요";
  if (/가격|요금|얼마/.test(m)) return "요금 정보를 불러오고 있어요";
  if (/혜택|멤버십/.test(m)) return "혜택 정보를 확인하고 있어요";
  if (/질문|뭐|어떤|어느/.test(m)) return "질문을 분석하고 있어요";
  return "답변을 생각하고 있어요";
}

export function setupChatSocket(io: Server) {
  const chatNamespace = io.of("/chat");

  chatNamespace.on("connection", (socket: Socket) => {
    console.log("🔌 새로운 소켓 연결 성공");

    const { token, sessionId } = socket.handshake.auth as ChatSocketAuth;
    const userId = resolveConnectionUserId(token);
    if (token && !userId) {
      socket.emit("error", "로그인 정보가 만료되었어요. 다시 로그인해 주세요.");
      socket.disconnect();
      return;
    }

    let currentSessionId: string;
    let promptContent: string;
    let collectedInfo: SurveyAnswers | undefined;
    let signupCollectedData: Record<string, unknown> | undefined;
    let previousInteractionId: string | undefined;
    let serverSignupStep: SignupStep | undefined;
    let serverPlanCode: string | undefined;
    let processingMessage = false;

    async function emitSignup(data: {
      signupStep?: SignupStep;
      signupData?: Record<string, unknown> | SignupCollectedData;
    }) {
      const nextStep = data.signupStep ?? serverSignupStep;
      await updateSignupCollectedData(currentSessionId, {
        ...signupCollectedData,
        _serverStep: nextStep,
        _serverPlanCode: serverPlanCode,
      });
      serverSignupStep = nextStep;
      socket.emit("signup", { ...data, signupData: signupCollectedData ?? {} });
    }
    // 진행 중인 AI 응답을 식별하는 id. "stop" 이벤트가 오면 stoppedRequestId에
    // 현재 요청 id를 기록해, 그 요청에 속한 이후의 emit/DB 처리를 모두 건너뜀
    let activeRequestId: string | null = null;
    let stoppedRequestId: string | null = null;
    // 진짜 스트리밍으로 바뀌면서 진행 중인 AI 호출을 실제로 중간에 끊을 수 있게 됨.
    // "stop" 이벤트가 오면 이걸 abort해서 서버가 응답을 계속 생성/전송하는 걸 즉시 멈춤
    let activeAbortController: AbortController | null = null;

    const sessionReady = (async () => {
      const { session } = await resolveChatSession(userId, sessionId);

      currentSessionId = session._id.toString();
      promptContent = await getPromptContentByVersion(session.prompt_version);
      collectedInfo =
        (session.collected_info as SurveyAnswers | null) ?? undefined;
      signupCollectedData =
        (session.signup_collected_data as Record<string, unknown> | null) ??
        undefined;
      previousInteractionId = session.last_interaction_id ?? undefined;
      serverSignupStep = signupCollectedData?._serverStep as
        SignupStep | undefined;
      serverPlanCode = signupCollectedData?._serverPlanCode as
        string | undefined;

      console.log(
        `[세션 ${currentSessionId}] 사용 중인 프롬프트 버전:`,
        session.prompt_version,
      );

      socket.emit("session_created", {
        sessionId: currentSessionId,
        promptVersion: session.prompt_version,
      });
      return true;
    })().catch((error: unknown) => {
      console.error("채팅 세션 초기화 실패:", error);
      socket.emit("error", "상담을 시작하지 못했어요. 다시 연결해 주세요.");
      socket.disconnect();
      return false;
    });

    socket.on("message", async (payload: ChatMessagePayload) => {
      if (!payload || typeof payload !== "object") {
        socket.emit("error", "메시지가 유효하지 않습니다.");
        return;
      }
      const {
        message,
        simulateError,
        surveyContext,
        preselectedPlanCode,
        recommendedByAI = false,
        isKickoff = false,
        signupCollectedData: clientSignupData,
        identityVerification,
      } = payload;

      if (
        typeof message !== "string" ||
        message.trim() === "" ||
        message.length > 4096
      ) {
        socket.emit("error", "메시지가 유효하지 않습니다.");
        return;
      }

      // 이번 요청을 식별할 id를 발급함. "stop" 이벤트는 이 id를 stoppedRequestId에
      // 기록하므로, 이후 코드는 requestId === stoppedRequestId 여부로 중단 여부를 판단함
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        if (token) verifyAccessToken(token);
        await consumeChatQuota(userId, socket.handshake.address ?? "unknown");
      } catch {
        socket.emit(
          "error",
          "요청 한도를 초과했거나 로그인이 만료되었어요. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      // Ignore overlapping messages before replacing the active cancellation target.
      if (processingMessage) return;
      activeRequestId = requestId;
      const isStopped = () => stoppedRequestId === requestId;
      const abortController = new AbortController();
      activeAbortController = abortController;

      if (simulateError) {
        socket.emit("error", "시뮬레이션 에러가 발생했습니다.");
        socket.disconnect();
        return;
      }

      if (!env.AI_API_KEY) {
        socket.emit("error", "AI API 키가 등록되지 않았습니다.");
        socket.disconnect();
        return;
      }

      if (!env.AI_MODEL) {
        socket.emit("error", "AI 모델이 설정되지 않았습니다.");
        socket.disconnect();
        return;
      }

      // 로딩 문구는 세션 조회·DB 저장(await sessionReady, saveMessage) 같은 비동기
      // 작업을 하나도 거치지 않고, 메시지를 받자마자 동기적으로 가장 먼저 보냄.
      // getThinkingMessage는 payload만으로 계산되므로 이 시점에 바로 알 수 있음
      if (processingMessage) return;
      processingMessage = true;
      socket.emit("thinking", getThinkingMessage(message, serverSignupStep));

      try {
        if (!(await sessionReady)) return;
        if (
          preselectedPlanCode &&
          (preselectedPlanCode !== serverPlanCode ||
            message.trim() === "처음부터 다시")
        ) {
          serverSignupStep = undefined;
          serverPlanCode = preselectedPlanCode;
          signupCollectedData = {};
        }
        const currentSignupStep = serverSignupStep;

        // 킥오프 메시지는 DB에 사용자 메시지로 저장하지 않음
        if (!isKickoff) {
          if (identityVerification) {
            // 이름·생년월일·휴대폰 번호가 그대로 담긴 자연어 문장 대신, 구조화된
            // JSON(identityVerification)을 signup_data에 저장함
            await saveMessage(
              currentSessionId,
              "user",
              "",
              undefined,
              "identity_verification_complete",
              identityVerification,
            );
          } else {
            await saveMessage(currentSessionId, "user", message);
          }
        }

        // ── 가입 플로우 분기 ──────────────────────────────────────────────────
        if (preselectedPlanCode) {
          // 동의/본인 확인/단계는 서버가 수집한 값만 사용합니다.
          const currentSignupData = { ...signupCollectedData };
          if (
            clientSignupData?.selectedBenefits &&
            (!currentSignupStep || currentSignupStep === "select_benefits")
          ) {
            currentSignupData.selectedBenefits =
              clientSignupData.selectedBenefits;
          }
          signupCollectedData = currentSignupData;

          const plan = (await getPlanByCode(
            preselectedPlanCode,
          )) as unknown as Record<string, unknown> & {
            code: string;
            name: string;
            discountFee?: number;
            monthlyFee: number;
            choiceBenefits: {
              code: string;
              title: string;
              selectionCount: number;
              required: boolean;
              options: {
                code: string;
                title: string;
                description: string | null;
              }[];
            }[];
          };
          if (!plan) {
            socket.emit("error", "요금제를 찾을 수 없습니다.");
            return;
          }

          const planSnapshot = {
            code: plan.code,
            name: plan.name,
            monthlyFee: plan.discountFee ?? plan.monthlyFee,
          };

          // "가입 신청하기" 확정 시의 실제 가입 처리. AI 판단 경로와 아래 결정론적
          // 단축 경로 양쪽에서 재사용하기 위해 함수로 분리함
          async function completeSignup() {
            // preselectedPlanCode가 있는 분기 안에서만 호출되지만, 클로저 캡처값이라
            // TS가 못 좁혀서 다시 확인함
            if (!userId || !preselectedPlanCode) {
              throw new Error("로그인 후 가입해 주세요.");
            }

            const sd = signupCollectedData as SignupCollectedData | undefined;
            assertSignupReady(serverSignupStep, sd, plan.choiceBenefits);
            const selectedBenefits =
              (sd?.selectedBenefits as Record<string, string[]> | undefined) ??
              {};
            const paymentMethod = sd?.paymentMethod ?? "신용카드";

            console.log("[가입 DB] 시도:", {
              userId,
              planCode: preselectedPlanCode,
              selectedBenefits,
              paymentMethod,
            });

            try {
              try {
                await subscribeUserToPlan({
                  userId,
                  planCode: preselectedPlanCode,
                  selectedOptions: selectedBenefits,
                  paymentMethod,
                });
              } catch (subscribeError) {
                // DB 반영 직후 연결이 끊겨 완료 이벤트만 유실된 경우의 재시도는
                // 이미 같은 요금제를 이용 중이면 성공으로 간주합니다.
                const currentPlan = await getCurrentPlan(userId);
                if (currentPlan?.planCode !== preselectedPlanCode) {
                  throw subscribeError;
                }
              }

              await emitSignup({ signupStep: "completed", signupData: sd });
              // 요금제 변경 자체가 성공하면 즉시 완료 화면을 표시합니다.
              // 퍼널/대화 기록 실패가 실제 가입 성공을 UI 오류로 뒤집으면 안 됩니다.
              socket.emit("signup_complete", {
                planCode: preselectedPlanCode,
                planName: plan.name,
                monthlyFee: plan.discountFee ?? plan.monthlyFee,
                paymentMethod,
              });

              try {
                // AI 추천으로 시작된 가입만 "전환"으로 집계함
                if (recommendedByAI) {
                  await recordConversionEvent(
                    currentSessionId,
                    "signup_completed",
                  );
                }

                // signup_complete 카드 DB 저장
                await saveMessage(
                  currentSessionId,
                  "ai",
                  "",
                  undefined,
                  "signup_complete",
                  undefined,
                  planSnapshot,
                );

                // 가입 완료 후 signupData 초기화 (재가입 시 정보 재수집을 위해)
                signupCollectedData = undefined;
                await updateSignupCollectedData(currentSessionId, {});
              } catch (postSignupError) {
                console.error("가입 완료 후 기록 처리 에러:", postSignupError);
              }

              console.log(
                `✅ 가입 완료: userId=${userId}, plan=${preselectedPlanCode}`,
              );
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.error("가입 DB 처리 에러:", errMsg, err);
              socket.emit("error", "가입 처리 중 오류가 발생했습니다.");
            }
          }

          // 최종 확인 카드는 혜택 코드(genie-music) 대신 제목(지니뮤직)을 보여줘야 함 —
          // 실제 가입 처리는 계속 코드 그대로의 signupData를 쓰므로, 카드 표시용
          // 스냅샷에만 적용함
          function resolveBenefitTitlesForDisplay(
            signupData: Record<string, unknown>,
          ): Record<string, unknown> {
            const selected = signupData.selectedBenefits as
              Record<string, string[]> | undefined;
            if (!selected) return signupData;

            const resolved: Record<string, string[]> = {};
            for (const [stepCode, optionCodes] of Object.entries(selected)) {
              const step = (plan.choiceBenefits ?? []).find(
                (b) => b.code === stepCode,
              );
              resolved[stepCode] = optionCodes.map((optionCode) => {
                const option = step?.options.find((o) => o.code === optionCode);
                return option?.title ?? optionCode;
              });
            }

            return { ...signupData, selectedBenefits: resolved };
          }

          // 로그인 사용자가 이미 동일 요금제를 이용 중이면 가입 차단
          if (userId) {
            const activePlan = await getCurrentPlan(userId);
            if (activePlan?.planCode === preselectedPlanCode) {
              socket.emit(
                "chunk",
                `**${plan.name}**은(는) 현재 이용 중인 요금제예요. 다른 요금제를 선택해 주세요.`,
              );
              socket.emit("done");
              return;
            }
          }

          // 가입 플로우의 첫 턴(프론트가 아직 어떤 단계도 받아본 적 없음)은 AI를 거치지
          // 않고 결정론적으로 사기 예방 안내부터 바로 보냄. AI에게 맡기면 한 턴 만에
          // 여러 단계를 한꺼번에(심지어 본인인증 완료 같은 없는 정보까지 지어내며)
          // 건너뛰어버리는 경우가 있었음. 법적으로 반드시 보여줘야 하는 이 안내만큼은
          // 매번 완전히 똑같은 고정 문구로 내려서 그 위험 자체를 없앰
          if (!currentSignupStep) {
            const fraudWarningMessage =
              "가입을 진행하기 전에 먼저 개통 사기 예방을 위한 안내를 드릴게요.\n\n" +
              "휴대폰·유심 개통 목적을 반드시 직접 확인하시고, 타인에게 양도하거나 " +
              "금융 사기에 이용되는 경우 법적 책임이 발생할 수 있습니다.\n\n" +
              "안내 내용을 확인하셨다면 아래 '확인했어요'를 눌러주시거나, 채팅으로 확인했다고 말씀해 주세요.";

            if (!isStopped()) {
              socket.emit("chunk", fraudWarningMessage);
            }
            if (isStopped()) {
              return;
            }

            await saveMessage(currentSessionId, "ai", fraudWarningMessage);
            await saveMessage(
              currentSessionId,
              "ai",
              "",
              undefined,
              "fraud_warning",
            );

            // 이전 대화(다른 요금제로 가입을 시도했던 이력이나 일반 상담 대화)의 AI
            // 메모리를 여기서 끊음. 안 끊으면 그 이전 맥락(예: 이전 요금제 가입 때
            // 이미 납부 방법까지 얘기가 오갔던 것)을 이 새 가입 시도에도 이어받아서,
            // AI가 이번엔 실제로 진행한 적 없는 단계까지 이미 끝난 것처럼 착각함
            previousInteractionId = undefined;
            await updateLastInteractionId(currentSessionId, null);

            await updateSignupCollectedData(
              currentSessionId,
              currentSignupData ?? {},
            );
            signupCollectedData = currentSignupData ?? {};
            // AI가 이 세션에서 실제로 추천한 요금제로 가입할 때만 "AI 추천 전환"으로 집계함.
            // 탐색 페이지에서 혼자 찾은 요금제도 preselectedPlanCode는 똑같이 실려오므로,
            // 이 플래그 없이 무조건 기록하면 AI와 무관한 가입까지 전환으로 잡혀버림
            if (recommendedByAI) {
              await recordConversionEvent(currentSessionId, "signup_started");
            }

            await emitSignup({
              signupStep: "fraud_warning",
              signupData: currentSignupData ?? {},
            });
            socket.emit("quickReplies", ["확인했어요"]);
            socket.emit("done");
            return;
          }

          // paused 상태에서 "가입 중단하기" 버튼 대신 자유 텍스트로 명확히 거부
          // 의사를 밝히는 경우(예: "가입하기 싫다고")도 버튼을 누른 것과 동일하게
          // 즉시 종료함 — signupStep 스키마로는 AI가 "이탈"을 직접 표현할 수 없어서,
          // 버튼 재확인만 반복 요구하던 문제가 있었음
          const EXPLICIT_SIGNUP_REJECTION_PATTERNS = [
            "가입하기 싫",
            "가입 안 할",
            "가입 안할",
            "그만할래",
            "그만 할래",
            "그만할게",
            "가입 취소",
            "취소할래",
          ];
          const trimmedMessage = message.trim();
          const isExplicitSignupExit =
            trimmedMessage === "가입 중단하기" ||
            (currentSignupStep === "paused" &&
              EXPLICIT_SIGNUP_REJECTION_PATTERNS.some((pattern) =>
                trimmedMessage.includes(pattern),
              ));

          // currentSignupStep을 "paused"로 한정하면, GATED 불일치 안내를 막 받아
          // 프론트가 아직 이전 단계값을 들고 있는 타이밍에 종료 문구가 반복되는
          // 문제가 있어서, 가입 플로우 중이기만 하면 항상 즉시 이탈로 처리함
          if (currentSignupStep && isExplicitSignupExit) {
            const exitMessage =
              "네, 가입은 여기서 멈출게요. 다른 요금제가 궁금하시면 편하게 물어보시고, 필요하실 때 요금제 상세 페이지에서 가입을 다시 시작하시면 돼요!";

            if (!isStopped()) {
              socket.emit("chunk", exitMessage);
            }
            if (isStopped()) {
              return;
            }

            await saveMessage(currentSessionId, "ai", exitMessage);

            // 가입 전용 프롬프트로 쌓인 AI 메모리를 끊음 — 이후엔 형식이 전혀 다른
            // 일반 상담 프롬프트(구분자 기반)를 쓰므로 섞이면 안 됨
            previousInteractionId = undefined;
            await updateLastInteractionId(currentSessionId, null);

            // 이번에 그만둔 가입 시도의 이름/전화번호/선택 혜택 등이 DB에 남아있으면,
            // 다음에 새로 가입을 시작할 때(같은 요금제든 다른 요금제든) 섞여 들어갈 수
            // 있으므로 서버 쪽 가입 수집 데이터도 함께 비움
            await updateSignupCollectedData(currentSessionId, {});
            signupCollectedData = {};
            serverSignupStep = undefined;
            serverPlanCode = undefined;

            socket.emit("signup_exit");
            socket.emit("quickReplies", []);
            socket.emit("done");
            return;
          }

          // paused 상태에서 사용자가 다시 이어가고 싶어할 때. "가입 계속하기"도 정해진
          // 문구라 AI 호출 없이 즉시 처리함 — AI의 메타데이터 판단이 이 재개 자체를
          // 놓치는 경우가 있어서(텍스트↔메타데이터 어긋남), 판단에 기대지 않고
          // 결정론적으로 원래 단계로 복귀시킴. select_benefits만 예외 — 요금제별
          // 혜택 목록을 다시 안내해야 해서(동적 내용) 기존 AI 판단 경로로 흘려보냄
          if (
            currentSignupStep === "paused" &&
            message.trim() === "가입 계속하기"
          ) {
            const pausedStep =
              (currentSignupData?.pausedStep as SignupStep | undefined) ??
              "fraud_warning";

            if (pausedStep !== "select_benefits") {
              const resumeMessages: Partial<Record<SignupStep, string>> = {
                fraud_warning:
                  "네, 다시 진행할게요! 안내 내용을 확인하셨다면 채팅으로 확인했다고 말씀해 주세요.",
                terms_agreement:
                  "네, 다시 진행할게요! 위 약관에 모두 동의하신 뒤 **다음** 버튼을 눌러주세요.",
                identity_verification:
                  "네, 다시 진행할게요! 아래 카드에서 본인 확인을 완료해 주세요.",
                select_payment:
                  "네, 다시 진행할게요! 요금 납부 방법을 선택해 주세요.",
                final_confirm:
                  "네, 다시 진행할게요! 아래 정보를 확인하시고, 맞으시면 채팅으로 '가입 신청하기'라고 보내주세요.",
              };
              const resumeQuickReplies: Partial<Record<SignupStep, string[]>> =
                {
                  fraud_warning: ["확인했어요"],
                  terms_agreement: [],
                  identity_verification: [],
                  select_payment: [
                    "계좌이체",
                    "신용카드",
                    "카카오페이",
                    "네이버페이",
                    "토스",
                  ],
                  final_confirm: ["가입 신청하기", "처음부터 다시"],
                };
              const resumeMessage =
                resumeMessages[pausedStep] ?? "네, 가입을 다시 진행할게요!";

              if (!isStopped()) {
                socket.emit("chunk", resumeMessage);
              }
              if (isStopped()) {
                return;
              }

              await saveMessage(currentSessionId, "ai", resumeMessage);

              const resumedSignupData = { ...(currentSignupData ?? {}) };
              delete resumedSignupData.pausedStep;
              await updateSignupCollectedData(
                currentSessionId,
                resumedSignupData,
              );
              signupCollectedData = resumedSignupData;

              // 카드 타입 단계는 재접속/새로고침 시 복원용으로 카드 메시지를 다시 저장함
              if (pausedStep === "terms_agreement") {
                await saveMessage(
                  currentSessionId,
                  "ai",
                  "",
                  undefined,
                  "terms",
                );
              } else if (pausedStep === "identity_verification") {
                await saveMessage(
                  currentSessionId,
                  "ai",
                  "",
                  undefined,
                  "identity_verification",
                );
              }

              await emitSignup({
                signupStep: pausedStep,
                signupData: resumedSignupData,
              });
              socket.emit("quickReplies", resumeQuickReplies[pausedStep] ?? []);
              socket.emit("done");
              return;
            }
          }

          // 약관 동의/본인인증처럼 지정된 UI(체크박스+버튼, 인증 폼)를 통해서만 다음
          // 단계로 넘어가는 단계들. 애매한 자유 텍스트("음" 등)를 AI가 완료 의사로
          // 오판해 넘겨버리는 걸 막기 위해 결정론적으로 검증함.
          // fraud_warning은 여기 포함하지 않음 — 버튼/고정 문구가 아니라 AI가 자유
          // 텍스트의 긍정/부정 의미를 직접 판단해서 진행 여부를 결정해야 하는 단계라서
          const GATED_SIGNUP_STEPS: Record<
            string,
            { triggerPrefix: string; nudge: string }
          > = {
            terms_agreement: {
              triggerPrefix: "동의합니다",
              nudge: "위 약관에 모두 동의하신 뒤 **다음** 버튼을 눌러주세요.",
            },
            identity_verification: {
              triggerPrefix: "본인인증 완료",
              nudge:
                "카드에 이름·생년월일·휴대폰 번호를 입력하고 본인인증을 완료해 주세요.",
            },
          };

          // 위 두 단계는 트리거 문구가 오면 다음 단계가 무엇인지 이미 코드로 확실히
          // 알 수 있어서(카드 UI를 통해서만 만들어지는, 정해진 형식의 메시지라
          // AI의 자유로운 판단이 필요 없음), AI 호출 없이 fraud_warning 첫 턴과 같은
          // 방식으로 즉시 다음 카드를 띄움. 1~2차 AI 호출(수 초~수십 초)을 기다릴
          // 필요가 없어져서 체감 속도가 크게 개선됨. 혜택은 상세 페이지에서 미리
          // 선택하며, 본인 확인 후에는 결제 방법 선택으로 바로 진행함
          if (
            currentSignupStep &&
            GATED_SIGNUP_STEPS[currentSignupStep] &&
            message
              .trim()
              .startsWith(GATED_SIGNUP_STEPS[currentSignupStep].triggerPrefix)
          ) {
            const base = { ...(currentSignupData ?? {}) };
            let shortcut: {
              nextStep: SignupStep;
              responseMessage: string;
              quickReplies: string[];
              signupData: Record<string, unknown>;
            } | null = null;

            if (currentSignupStep === "terms_agreement") {
              shortcut = {
                nextStep: "identity_verification",
                responseMessage: "이제 본인 확인을 진행해 주세요.",
                quickReplies: [],
                signupData: { ...base, agreedToTerms: true },
              };
            } else if (currentSignupStep === "identity_verification") {
              validateIdentityInput(identityVerification);
              const selectableSteps = (plan.choiceBenefits ?? []).filter(
                (b) => b.options.length > 0,
              );

              const identitySignupData = {
                ...base,
                identityVerified: true,
                ...(identityVerification
                  ? {
                      name: identityVerification.name,
                      birth: identityVerification.birth,
                      phoneNumber: identityVerification.phoneNumber,
                    }
                  : {}),
              };

              Object.assign(currentSignupData, identitySignupData);
              signupCollectedData = currentSignupData;
              // select_benefits 단계(AI에게 남은 필수 혜택을 물어보게 하던 경로)를
              // 완전히 없애고, 본인확인이 끝나면 항상 바로 결제 방법 선택으로 넘김.
              // 상세 페이지에서 미리 고른 혜택은 signupData에 그대로 남아있으므로
              // 가입 완료 시 반영됨
              shortcut = {
                nextStep: "select_payment",
                responseMessage:
                  selectableSteps.length > 0
                    ? "이미 선택하신 혜택으로 진행할게요. 이제 요금 납부 방법을 선택해 주세요."
                    : "본인 확인이 완료됐어요. 이제 요금 납부 방법을 선택해 주세요.",
                quickReplies: [
                  "계좌이체",
                  "신용카드",
                  "카카오페이",
                  "네이버페이",
                  "토스",
                ],
                signupData: identitySignupData,
              };
            }

            if (shortcut) {
              if (!isStopped()) {
                socket.emit("chunk", shortcut.responseMessage);
              }
              if (isStopped()) {
                return;
              }

              await saveMessage(
                currentSessionId,
                "ai",
                shortcut.responseMessage,
              );
              if (shortcut.nextStep === "identity_verification") {
                await saveMessage(
                  currentSessionId,
                  "ai",
                  "",
                  undefined,
                  "identity_verification",
                );
              }

              await updateSignupCollectedData(
                currentSessionId,
                shortcut.signupData,
              );
              signupCollectedData = shortcut.signupData;
              await recordConversionEvent(currentSessionId, "signup_started");

              await emitSignup({
                signupStep: shortcut.nextStep,
                signupData: shortcut.signupData,
              });
              socket.emit("quickReplies", shortcut.quickReplies);
              socket.emit("done");
              return;
            }
          } else if (
            currentSignupStep &&
            GATED_SIGNUP_STEPS[currentSignupStep]
          ) {
            // 트리거 문구가 오지 않았을 때. 이전엔 AI에게 "관련 질문이면 답하고 유지,
            // 아니면 이탈 의사로 판단해 paused로" 같은 자유 판단을 맡겼는데, 메시지
            // (1차 호출)와 메타데이터(2차 호출)가 서로 어긋나서 안내 문구·요금제
            // 추천 목록·되돌리기 안내가 한 말풍선에 뒤섞여 나오는 문제가 반복됐음.
            // 그래서 AI 판단을 아예 거치지 않고, 트리거 문구가 아닌 모든 메시지를
            // 결정론적으로 paused로 보내 "가입 계속하기/가입 중단하기" 둘 중 하나를
            // 명확히 고르게 함
            const pauseMessage =
              "가입 절차 중이신데, 다른 이야기신가요? 가입을 계속 진행하시겠어요, 아니면 중단하시겠어요?";

            if (!isStopped()) {
              socket.emit("chunk", pauseMessage);
            }
            if (isStopped()) {
              return;
            }

            await saveMessage(currentSessionId, "ai", pauseMessage);

            const pausedSignupData = {
              ...(currentSignupData ?? {}),
              pausedStep: currentSignupStep as SignupStep,
            };
            await updateSignupCollectedData(currentSessionId, pausedSignupData);
            signupCollectedData = pausedSignupData;

            await emitSignup({
              signupStep: "paused",
              signupData: pausedSignupData,
            });
            socket.emit("quickReplies", ["가입 계속하기", "가입 중단하기"]);
            socket.emit("done");
            return;
          }

          // "확인했어요" 버튼을 정확히 그대로 탭하면 GATED 단계들처럼 AI 호출 없이
          // 즉시 다음 단계로 넘김. 자유 텍스트 답변은 여전히 AI가 긍정/부정을 판단함
          if (
            currentSignupStep === "fraud_warning" &&
            message.trim() === "확인했어요"
          ) {
            const termsMessage =
              "이제 약관에 동의해 주세요. 아래 약관을 확인하시고 모두 동의하신 뒤 **다음** 버튼을 눌러주세요.";

            if (!isStopped()) {
              socket.emit("chunk", termsMessage);
            }
            if (isStopped()) {
              return;
            }

            await saveMessage(currentSessionId, "ai", termsMessage);
            await saveMessage(currentSessionId, "ai", "", undefined, "terms");

            const base = {
              ...(currentSignupData ?? {}),
              fraudWarningAcknowledged: true,
            };
            await updateSignupCollectedData(currentSessionId, base);
            signupCollectedData = base;
            await recordConversionEvent(currentSessionId, "signup_started");

            await emitSignup({
              signupStep: "terms_agreement",
              signupData: base,
            });
            socket.emit("quickReplies", []);
            socket.emit("done");
            return;
          }

          // 납부 방법 버튼을 정확히 그대로 탭하면 AI 호출 없이 즉시 최종 확인으로 넘김
          const PAYMENT_METHOD_QUICK_REPLIES = [
            "계좌이체",
            "신용카드",
            "카카오페이",
            "네이버페이",
            "토스",
          ];
          if (
            currentSignupStep === "select_payment" &&
            PAYMENT_METHOD_QUICK_REPLIES.includes(message.trim())
          ) {
            const finalConfirmMessage =
              "결제 방법을 확인했어요. 아래 정보를 확인하시고, 맞으시면 채팅으로 '가입 신청하기'라고 보내주세요.";

            if (!isStopped()) {
              socket.emit("chunk", finalConfirmMessage);
            }
            if (isStopped()) {
              return;
            }

            await saveMessage(currentSessionId, "ai", finalConfirmMessage);

            const paymentSignupData: Record<string, unknown> = {
              ...(currentSignupData ?? {}),
              paymentMethod: message.trim(),
            };
            await saveMessage(
              currentSessionId,
              "ai",
              "",
              undefined,
              "signup_summary",
              resolveBenefitTitlesForDisplay(paymentSignupData),
              planSnapshot,
            );

            await updateSignupCollectedData(
              currentSessionId,
              paymentSignupData,
            );
            signupCollectedData = paymentSignupData;

            await emitSignup({
              signupStep: "final_confirm",
              signupData: paymentSignupData,
            });
            socket.emit("quickReplies", ["가입 신청하기", "처음부터 다시"]);
            socket.emit("done");
            return;
          }

          // "가입 신청하기"를 정확히 그대로 보내면 AI 호출 없이 즉시 가입을 확정함
          if (
            currentSignupStep === "final_confirm" &&
            message.trim() === "가입 신청하기"
          ) {
            socket.emit("quickReplies", []);
            await completeSignup();

            if (!isStopped()) {
              socket.emit("done");
            }
            return;
          }

          const { decision, interactionId } = await getSignupDecision(
            {
              message,
              previousInteractionId,
              promptContent,
              preselectedPlan: {
                code: plan.code,
                name: plan.name,
                monthlyFee: plan.discountFee ?? plan.monthlyFee,
              },
              signupCollectedData: currentSignupData,
              choiceBenefits: (plan.choiceBenefits ?? [])
                .filter((b) => b.options.length > 0)
                .map((b) => ({
                  code: b.code,
                  title: b.title,
                  selectionCount: b.selectionCount,
                  required: b.required,
                  options: (b.options ?? []).map((o) => ({
                    code: o.code,
                    title: o.title,
                    description: o.description ?? null,
                  })),
                })),
            },
            (text) => {
              if (!isStopped()) socket.emit("chunk", text);
            },
            () => {
              // 텍스트 스트리밍은 끝났지만, 카드/퀵답변처럼 뒤에 더 올 수 있는 내용이
              // 있어서 프론트에 로딩 상태를 명시적으로 알려줌
              if (!isStopped()) socket.emit("loading_extra");
            },
            abortController.signal,
          );

          // 응답을 받아온 시점에 이미 정지됐다면 DB 저장·세션 상태 갱신 없이 버림
          // (저장해버리면 새로고침 시 정지했던 턴이 되살아나고 다음 메시지도 그
          // 문맥을 이어받음)
          if (isStopped()) {
            return;
          }

          // (가입 플로우 첫 턴은 위에서 AI 호출 없이 이미 처리되고 return되므로, 이
          // 아래는 항상 currentSignupStep이 있는 이후 턴에서만 실행됨)

          // (GATED_SIGNUP_STEPS 대상 단계는 트리거 문구 일치/불일치 여부로 위에서 이미
          // 전부 결정론적으로 처리되고 return되므로, 이 아래는 항상 GATED 대상이 아닌
          // 단계에서만 실행됨)

          // GATED_SIGNUP_STEPS가 커버하지 않는 단계(fraud_warning, select_benefits,
          // select_payment 등)는 다음 단계로 넘어갈지 여전히 AI 자유 판단에 맡기지만,
          // "다음 단계로 간다"는 결론이면 SIGNUP_STEP_ORDER상 바로 다음 단계로만
          // 가도록 강제함 — 사용자가 가입을 그만두거나(paused) 다른 요금제를
          // 원하는 게 아닌 한, 한 턴에 여러 단계를 한꺼번에 건너뛸 수 없음
          if (
            currentSignupStep &&
            currentSignupStep !== "paused" &&
            decision.signupStep &&
            decision.signupStep !== currentSignupStep &&
            decision.signupStep !== "paused"
          ) {
            const fromIdx = SIGNUP_STEP_ORDER.indexOf(
              currentSignupStep as SignupStep,
            );
            const toIdx = SIGNUP_STEP_ORDER.indexOf(decision.signupStep);
            if (fromIdx !== -1 && toIdx !== -1) {
              if (toIdx > fromIdx + 1) {
                decision.signupStep = SIGNUP_STEP_ORDER[fromIdx + 1];
              } else if (toIdx < fromIdx) {
                // AI가 "다른 요금제로 바꾸고 싶다"는 의사를 이전 단계로 되돌리는
                // 것으로 잘못 표현하는 경우가 있어서(쌓인 signupData는 그대로 둔 채
                // 이전 카드만 다시 띄움), 뒤로 가는 건 항상 paused로 강제함
                decision.signupStep = "paused";
                decision.signupData = {
                  ...(decision.signupData ?? {}),
                  pausedStep: currentSignupStep as SignupStep,
                };
                decision.quickReplies = ["가입 계속하기", "가입 중단하기"];
              }
            }
          }

          // paused 상태에서 "가입 계속하기"/"가입 중단하기" 정확한 문구는 이미 위에서
          // AI 호출 전에 결정론적으로 처리되고 return됨. 여기 도달했다는 건 그 외의
          // 자유 텍스트(예: "응 계속할래", select_benefits 재개 등)라는 뜻이므로,
          // AI의 재개 의사 판단은 존중하되 저장해둔 pausedStep 외의 엉뚱한 단계로
          // 바로 건너뛰는 것만 결정론적으로 막음(재개 의사가 불명확하면 paused 유지)
          if (currentSignupStep === "paused") {
            const pausedStep = currentSignupData?.pausedStep as
              SignupStep | undefined;
            if (
              decision.signupStep !== "paused" &&
              decision.signupStep !== pausedStep
            ) {
              decision.signupStep = pausedStep ?? "paused";
            }
          }

          // AI가 매 턴 signupData 전체를 다시 구성해서 돌려주는데, 이번 턴에서
          // 다루지 않은 필드(예: 요금제 상세 페이지에서 미리 골라둔 선택형 혜택)를
          // 빈 값으로 지어내 돌려주는 경우가 있어서, 그로 인해 이미 누적된 값이
          // 조용히 사라지는 문제가 있었음. AI가 실제로 뭔가 채워서 보내지 않는 한
          // (빈 객체가 아닌 한) 기존에 누적된 선택형 혜택을 유지함
          const priorSelectedBenefits = currentSignupData?.selectedBenefits as
            Record<string, string[]> | undefined;
          const aiSelectedBenefits = decision.signupData?.selectedBenefits;
          if (
            priorSelectedBenefits &&
            Object.keys(priorSelectedBenefits).length > 0 &&
            (!aiSelectedBenefits ||
              Object.keys(aiSelectedBenefits).length === 0)
          ) {
            decision.signupData = {
              ...decision.signupData,
              selectedBenefits: priorSelectedBenefits,
            };
          }

          // AI는 확인하지 않은 동의/인증/결제 정보를 생성하거나 가입을 확정할 수 없습니다.
          decision.signupData = {
            ...decision.signupData,
            agreedToTerms: currentSignupData.agreedToTerms === true,
            identityVerified: currentSignupData.identityVerified === true,
            fraudWarningAcknowledged:
              currentSignupData.fraudWarningAcknowledged === true ||
              (currentSignupStep === "fraud_warning" &&
                decision.signupStep === "terms_agreement"),
            name: currentSignupData.name as string | undefined,
            birth: currentSignupData.birth as string | undefined,
            phoneNumber: currentSignupData.phoneNumber as string | undefined,
            paymentMethod:
              currentSignupStep === "select_payment" &&
              PAYMENT_METHOD_QUICK_REPLIES.includes(
                decision.signupData?.paymentMethod ?? "",
              )
                ? decision.signupData?.paymentMethod
                : (currentSignupData.paymentMethod as SignupCollectedData["paymentMethod"]),
          };
          if (decision.signupStep === "completed") {
            decision.signupStep = "final_confirm";
            decision.quickReplies = ["가입 신청하기"];
          }
          await saveMessage(currentSessionId, "ai", decision.message);

          // 카드 타입 메시지 DB 저장 (재접속/관리자 열람 시 복원용, planSnapshot은
          // 위에서 이미 선언됨)
          const mergedSignupData = {
            ...(currentSignupData ?? {}),
            ...(decision.signupData
              ? (decision.signupData as unknown as Record<string, unknown>)
              : {}),
          };

          // 단계가 실제로 바뀐 턴에서만 카드를 저장함. 같은 단계에 머무는 동안
          // (예: 약관 동의 중 다른 질문을 하는 경우) 매번 카드를 다시 저장하면
          // 대화에 같은 카드가 중복으로 쌓임
          const isNewSignupStep = decision.signupStep !== currentSignupStep;

          if (isNewSignupStep && decision.signupStep === "terms_agreement") {
            await saveMessage(currentSessionId, "ai", "", undefined, "terms");
          } else if (
            isNewSignupStep &&
            decision.signupStep === "identity_verification"
          ) {
            await saveMessage(
              currentSessionId,
              "ai",
              "",
              undefined,
              "identity_verification",
            );
          } else if (
            isNewSignupStep &&
            decision.signupStep === "fraud_warning"
          ) {
            await saveMessage(
              currentSessionId,
              "ai",
              "",
              undefined,
              "fraud_warning",
            );
          } else if (
            isNewSignupStep &&
            decision.signupStep === "final_confirm"
          ) {
            await saveMessage(
              currentSessionId,
              "ai",
              "",
              undefined,
              "signup_summary",
              mergedSignupData,
              planSnapshot,
            );
          }

          // 본인인증 카드 단계를 막 벗어났다면, 최종 가입 완료를 기다리지 않고
          // 이름·생년월일·휴대폰 번호를 바로 유저 문서에 저장함 (중간 이탈해도 남도록)
          if (
            userId &&
            currentSignupStep === "identity_verification" &&
            decision.signupStep !== "identity_verification"
          ) {
            const name = mergedSignupData.name as string | undefined;
            const birth = mergedSignupData.birth as string | undefined;
            const phoneNumber = mergedSignupData.phoneNumber as
              string | undefined;
            if (name && birth && phoneNumber) {
              try {
                await saveVerifiedIdentity({
                  userId,
                  name,
                  birth,
                  phoneNumber,
                });
              } catch (err) {
                console.error("본인인증 정보 저장 실패:", err);
              }
            }
          }

          // signupData 세션에 누적 저장
          if (decision.signupData) {
            const updated = {
              ...(currentSignupData ?? {}),
              ...(decision.signupData as unknown as Record<string, unknown>),
            };
            await updateSignupCollectedData(currentSessionId, updated);
            signupCollectedData = updated;
          }

          await updateLastInteractionId(currentSessionId, interactionId);
          previousInteractionId = interactionId;

          // 가입 단계 퍼널 기록 (AI 추천으로 시작된 가입만 집계)
          if (recommendedByAI) {
            await recordConversionEvent(currentSessionId, "signup_started");
          }

          // 텍스트는 이미 1차 스트리밍 호출 중에 실시간으로 다 전송됐음
          if (isStopped()) {
            return;
          }

          // 프론트에 현재 signup 단계 알림. 텍스트 스트림이 다 끝난 뒤에 보내야
          // 약관동의/사기경고/최종확인 카드가 채팅 답변보다 먼저 뜨지 않음
          await emitSignup({
            signupStep: decision.signupStep,
            signupData: decision.signupData,
          });

          // 빈 배열이어도 항상 emit함 — 이전 턴 값을 그대로 두면, 이번 턴엔
          // 퀵답변이 없다고 AI가 판단했을 때 프론트가 그 사실을 못 받아 이전
          // 턴의 칩이 화면에 그대로 남아있는 문제가 있었음
          socket.emit("quickReplies", decision.quickReplies ?? []);

          if (!isStopped()) {
            socket.emit("done");
          }
          return;
        }

        // ── 기존 추천 플로우 ────────────────────────────────────────────────────
        const currentPlan = userId ? await getCurrentPlan(userId) : null;
        // 현재 이용 중인 요금제도 후보 목록([요금제 목록])에 그대로 포함시킴 —
        // 예전엔 여기서 제외했더니, 사용자가 "내 요금제 정보 알려줘"처럼 현재
        // 요금제 자체를 물어봐도 AI가 실제 데이터가 없어 사양을 지어내는 문제가
        // 있었음. 추천 후보에서 빠져야 하는 건 AI 프롬프트 지시(currentPlanBlock)와
        // 아래의 코드 레벨 필터로 이중으로 막음
        const candidates = await getPlanCandidates();

        // 사용자가 현재 요금제에서 실제로 고른 선택형 혜택(예: 지니뮤직)을 코드가
        // 아니라 제목으로 알려줘야, "내가 지금 쓰는 혜택이 뭐야?" 같은 질문에 AI가
        // 요금제의 일반적인 혜택 카테고리가 아니라 사용자가 실제 선택한 옵션으로 답함
        const currentPlanSelectedBenefits = currentPlan?.selectedOptions
          ? resolveSelectedBenefitTitles(
              currentPlan.selectedOptions,
              (
                (await getPlanByCode(currentPlan.planCode)) as unknown as {
                  choiceBenefits?: ChoiceBenefitLike[];
                } | null
              )?.choiceBenefits,
            )
          : undefined;

        const { decision, interactionId } = await getChatDecision(
          {
            message,
            previousInteractionId,
            surveyContext,
            collectedInfo,
            plans: candidates,
            promptContent,
            currentPlanCode: currentPlan?.planCode ?? null,
            currentPlanSelectedBenefits,
          },
          (text) => {
            if (!isStopped()) socket.emit("chunk", text);
          },
          () => {
            // 텍스트 스트리밍은 끝났지만, 카드/퀵답변처럼 뒤에 더 올 수 있는 내용이
            // 있어서 프론트에 로딩 상태를 명시적으로 알려줌
            if (!isStopped()) socket.emit("loading_extra");
          },
          abortController.signal,
        );

        // 응답을 받아온 시점에 이미 정지됐다면 DB 저장·세션 상태 갱신 없이 버림
        if (isStopped()) {
          return;
        }

        // 현재 이용 중인 요금제가 이제 candidates에 포함되어 있어서, AI가 프롬프트
        // 지시를 어기고 recommendations에 넣어버려도 여기서 코드로 확실히 걸러냄
        if (currentPlan?.planCode && decision.recommendations?.length) {
          decision.recommendations = decision.recommendations.filter(
            (r) => r.code !== currentPlan.planCode,
          );
        }

        let cards: ReturnType<typeof buildPlanCards> = [];
        if (
          decision.action === "recommend" &&
          decision.recommendations?.length
        ) {
          cards = buildPlanCards(decision.recommendations, candidates);
        }

        await saveMessage(
          currentSessionId,
          "ai",
          decision.message,
          cards.length > 0 ? cards : undefined,
        );

        if (decision.collectedInfo) {
          await updateCollectedInfo(currentSessionId, decision.collectedInfo);
          collectedInfo = decision.collectedInfo;
        }

        await updateLastInteractionId(currentSessionId, interactionId);
        previousInteractionId = interactionId;

        socket.emit("interaction", { interactionId });
        if (decision.collectedInfo) {
          socket.emit("info", decision.collectedInfo);
        }

        // 텍스트는 이미 1차 스트리밍 호출 중에 실시간으로 다 전송됐음
        if (isStopped()) {
          return;
        }

        if (cards.length > 0) {
          socket.emit("plans", cards);
        }

        // 빈 배열이어도 항상 emit함 — 그래야 이번 턴에 퀵답변이 없다는 것도
        // 프론트에 전달되어, 이전 턴 칩이 화면에 남아있지 않음
        if (decision.action === "ask") {
          socket.emit("quickReplies", decision.quickReplies ?? []);
        }

        socket.emit("done");
      } catch (aiError) {
        // "정지" 버튼으로 abort된 경우는 의도된 취소이지 에러가 아니므로 조용히 무시함
        if (isStopped()) {
          return;
        }
        console.error("AI 채팅 처리 에러:", aiError);
        socket.emit("error", "AI 서버 연결에 실패했습니다.");
      } finally {
        processingMessage = false;
      }
    });

    // 클라이언트가 "정지" 버튼을 눌렀을 때 호출됨. 현재 처리 중인 요청의 id를
    // stoppedRequestId에 기록해, 그 요청에 대한 이후의 DB 저장·세션 상태 갱신과
    // chunk/plans/quickReplies/signup/signup_complete/done emit을 모두 건너뛰게 함.
    // 단, 이미 진행 중인 AI API 호출 자체는 중간에 끊을 수 없어 끝까지 기다린 뒤 버림.
    socket.on("stop", () => {
      if (activeRequestId) {
        stoppedRequestId = activeRequestId;
      }
      // 진짜 스트리밍 덕분에 진행 중인 AI 호출 자체를 즉시 끊을 수 있음
      activeAbortController?.abort();
    });

    // 가입 플로우 진입 시 프론트가 화면에 즉시 보여준 안내 문구를 그대로 DB에
    // 저장함. LLM 호출 없이 텍스트를 그대로 기록만 하므로, AI 응답처럼 스트리밍
    // 하거나 별도 이벤트로 되돌려줄 필요가 없음(프론트가 이미 낙관적으로 렌더링함).
    socket.on("signup_entry", async (payload: SignupEntryPayload) => {
      const text = typeof payload?.text === "string" ? payload.text.trim() : "";
      if (!text) return;
      try {
        if (!(await sessionReady)) return;
        await saveMessage(
          currentSessionId,
          "ai",
          text,
          undefined,
          "signup_entry",
          payload.planCode ? { planCode: payload.planCode } : undefined,
        );
      } catch (err) {
        console.error("가입 인삿말 저장 에러:", err);
      }
    });

    socket.on("conversion_event", async (payload: ConversionEventPayload) => {
      if (!isFunnelStage(payload?.event)) return;
      try {
        if (!(await sessionReady)) return;
        await recordConversionEvent(currentSessionId, payload.event);
      } catch (err) {
        console.error("전환 이벤트 처리 에러:", err);
      }
    });

    socket.on("ui_event", async (payload: UiEventPayload) => {
      if (
        !isUiEventElement(payload?.element) ||
        !isUiEventAction(payload?.action)
      ) {
        return;
      }
      try {
        if (!(await sessionReady)) return;
        await recordUiEvent(currentSessionId, payload.element, payload.action);
      } catch (err) {
        console.error("UI 이벤트 처리 에러:", err);
      }
    });

    socket.on("consent", async (payload: ConsentPayload) => {
      if (typeof payload?.consented !== "boolean") return;

      try {
        if (!(await sessionReady)) return;
        await recordChatLogConsent(currentSessionId, payload.consented);
      } catch (err) {
        console.error("채팅 기록 동의 처리 에러:", err);
      }
    });

    socket.on("disconnect", async () => {
      console.log("🔌 소켓 연결 종료");
      try {
        if (!(await sessionReady)) return;
        await finalizeSessionStatus(currentSessionId);
      } catch (err) {
        console.error("세션 종료 처리 에러:", err);
      }
    });
  });
}
