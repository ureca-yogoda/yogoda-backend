import { Server, Socket } from "socket.io";

import { env } from "../../core/config/env.js";
import { FUNNEL_STAGES } from "../../constants/funnel-stage.js";
import { verifyToken } from "../../core/security/jwt.js";
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

function resolveConnectionUserId(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = verifyToken(token);
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

    let currentSessionId: string;
    let promptContent: string;
    let collectedInfo: SurveyAnswers | undefined;
    let signupCollectedData: Record<string, unknown> | undefined;
    let previousInteractionId: string | undefined;
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

      console.log(
        `[세션 ${currentSessionId}] 사용 중인 프롬프트 버전:`,
        session.prompt_version,
      );

      socket.emit("session_created", {
        sessionId: currentSessionId,
        promptVersion: session.prompt_version,
      });
    })();

    socket.on("message", async (payload: ChatMessagePayload) => {
      const {
        message,
        simulateError,
        surveyContext,
        preselectedPlanCode,
        isKickoff = false,
        signupCollectedData: clientSignupData,
        currentSignupStep,
        identityVerification,
      } = payload;

      if (!message || message.trim() === "") {
        socket.emit("error", "메시지가 유효하지 않습니다.");
        return;
      }

      // 이번 요청을 식별할 id를 발급함. "stop" 이벤트는 이 id를 stoppedRequestId에
      // 기록하므로, 이후 코드는 requestId === stoppedRequestId 여부로 중단 여부를 판단함
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
      socket.emit("thinking", getThinkingMessage(message, currentSignupStep));

      try {
        await sessionReady;

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
          // 클라이언트가 보내온 최신 signupData를 우선 사용
          const currentSignupData = clientSignupData
            ? (clientSignupData as unknown as Record<string, unknown>)
            : signupCollectedData;

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
              "안내 내용을 확인하셨다면 아래 버튼을 누르거나, 채팅으로 확인했다고 말씀해 주세요.";

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
            await recordConversionEvent(currentSessionId, "signup_started");

            socket.emit("signup", {
              signupStep: "fraud_warning",
              signupData: currentSignupData ?? {},
            });
            socket.emit("quickReplies", ["확인했어요"]);
            socket.emit("done");
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

          // 약관 동의/본인인증처럼 지정된 UI(버튼·모달)를 통해서만 다음 단계로
          // 넘어가야 하는 단계들. 애매한 자유 텍스트("음" 등)를 AI가 완료 의사로
          // 오판해 넘겨버리는 걸 막기 위해 결정론적으로 검증함. 정해진 문구로
          // 시작하는 메시지가 아니면, 그 사이 다른 질문에 대한 AI의 답변은 그대로
          // 쓰되 단계만 되돌리고 안내 문구를 덧붙임.
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
          const gate = currentSignupStep
            ? GATED_SIGNUP_STEPS[currentSignupStep]
            : undefined;
          if (
            gate &&
            decision.signupStep !== currentSignupStep &&
            !message.trim().startsWith(gate.triggerPrefix)
          ) {
            decision.signupStep = currentSignupStep as SignupStep;
            const nudgeText = `\n\n계속해서 가입을 진행할까요? ${gate.nudge}`;
            decision.message = `${decision.message}${nudgeText}`;
            // 원래 답변 텍스트는 이미 1차 스트리밍으로 화면에 다 전송된 뒤라, 여기서
            // signupStep만 조용히 되돌리면 화면(진행된 것처럼 보이는 문구)과 실제 상태
            // (이전 단계에 머묾)가 어긋나 사용자가 멈춘 이유를 알 수 없게 됨. 같은
            // 말풍선에 교정 안내를 실시간으로 이어붙여 화면과 실제 상태를 일치시킴
            if (!isStopped()) {
              socket.emit("chunk", nudgeText);
            }
          }

          await saveMessage(currentSessionId, "ai", decision.message);

          // 카드 타입 메시지 DB 저장 (재접속/관리자 열람 시 복원용)
          const planSnapshot = {
            code: plan.code,
            name: plan.name,
            monthlyFee: plan.discountFee ?? plan.monthlyFee,
          };
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

          // 가입 단계 퍼널 기록
          await recordConversionEvent(currentSessionId, "signup_started");

          // 텍스트는 이미 1차 스트리밍 호출 중에 실시간으로 다 전송됐음
          if (isStopped()) {
            return;
          }

          // 프론트에 현재 signup 단계 알림. 텍스트 스트림이 다 끝난 뒤에 보내야
          // 약관동의/사기경고/최종확인 카드가 채팅 답변보다 먼저 뜨지 않음
          socket.emit("signup", {
            signupStep: decision.signupStep,
            signupData: decision.signupData,
          });

          if (decision.quickReplies?.length) {
            socket.emit("quickReplies", decision.quickReplies);
          }

          // 가입 완료 처리
          if (decision.signupStep === "completed" && userId) {
            const sd = signupCollectedData as SignupCollectedData | undefined;
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

              // 요금제 변경 자체가 성공하면 즉시 완료 화면을 표시합니다.
              // 퍼널/대화 기록 실패가 실제 가입 성공을 UI 오류로 뒤집으면 안 됩니다.
              socket.emit("signup_complete", {
                planCode: preselectedPlanCode,
                planName: plan.name,
                monthlyFee: plan.discountFee ?? plan.monthlyFee,
                paymentMethod,
              });

              try {
                await recordConversionEvent(
                  currentSessionId,
                  "signup_completed",
                );

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

          if (!isStopped()) {
            socket.emit("done");
          }
          return;
        }

        // ── 기존 추천 플로우 ────────────────────────────────────────────────────
        const currentPlan = userId ? await getCurrentPlan(userId) : null;
        const candidates = await getPlanCandidates(currentPlan?.planCode);

        const { decision, interactionId } = await getChatDecision(
          {
            message,
            previousInteractionId,
            surveyContext,
            collectedInfo,
            plans: candidates,
            promptContent,
            currentPlanCode: currentPlan?.planCode ?? null,
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

        if (decision.action === "ask" && decision.quickReplies?.length) {
          socket.emit("quickReplies", decision.quickReplies);
        }

        socket.emit("done");
      } catch (aiError) {
        // "정지" 버튼으로 abort된 경우는 의도된 취소이지 에러가 아니므로 조용히 무시함
        if (isStopped()) {
          return;
        }
        console.error("AI 채팅 처리 에러:", aiError);
        socket.emit("error", "AI 서버 연결에 실패했습니다.");
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
      const text = payload.text?.trim();
      if (!text) return;
      try {
        await sessionReady;
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
      if (!isFunnelStage(payload.event)) return;
      try {
        await sessionReady;
        await recordConversionEvent(currentSessionId, payload.event);
      } catch (err) {
        console.error("전환 이벤트 처리 에러:", err);
      }
    });

    socket.on("ui_event", async (payload: UiEventPayload) => {
      if (
        !isUiEventElement(payload.element) ||
        !isUiEventAction(payload.action)
      ) {
        return;
      }
      try {
        await sessionReady;
        await recordUiEvent(currentSessionId, payload.element, payload.action);
      } catch (err) {
        console.error("UI 이벤트 처리 에러:", err);
      }
    });

    socket.on("consent", async (payload: ConsentPayload) => {
      if (typeof payload.consented !== "boolean") return;

      try {
        await sessionReady;
        await recordChatLogConsent(currentSessionId, payload.consented);
      } catch (err) {
        console.error("채팅 기록 동의 처리 에러:", err);
      }
    });

    socket.on("disconnect", async () => {
      console.log("🔌 소켓 연결 종료");
      try {
        await sessionReady;
        await finalizeSessionStatus(currentSessionId);
      } catch (err) {
        console.error("세션 종료 처리 에러:", err);
      }
    });
  });
}
