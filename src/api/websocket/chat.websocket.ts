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
} from "../../types/chat.js";

const TYPE_CHUNK_SIZE = 8;
const TYPE_CHUNK_DELAY_MS = 30;

interface ChatMessagePayload {
  message?: string;
  simulateError?: boolean;
  surveyContext?: SurveyContext;
  // 가입 플로우 전용
  preselectedPlanCode?: string;
  isKickoff?: boolean;
  signupCollectedData?: SignupCollectedData;
}

interface ChatSocketAuth {
  token?: string;
  sessionId?: string;
}

interface ConversionEventPayload {
  sessionId?: string;
  event?: string;
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

async function sendTypedText(socket: Socket, text: string) {
  for (let i = 0; i < text.length; i += TYPE_CHUNK_SIZE) {
    socket.emit("chunk", text.slice(i, i + TYPE_CHUNK_SIZE));
    await new Promise((resolve) => setTimeout(resolve, TYPE_CHUNK_DELAY_MS));
  }
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
      } = payload;

      if (!message || message.trim() === "") {
        socket.emit("error", "메시지가 유효하지 않습니다.");
        return;
      }

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

      try {
        await sessionReady;

        // 킥오프 메시지는 DB에 사용자 메시지로 저장하지 않음
        if (!isKickoff) {
          await saveMessage(currentSessionId, "user", message);
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

          const { decision, interactionId } = await getSignupDecision({
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
          });

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

          if (decision.signupStep === "terms_agreement") {
            await saveMessage(currentSessionId, "ai", "", undefined, "terms");
          } else if (decision.signupStep === "fraud_warning") {
            await saveMessage(
              currentSessionId,
              "ai",
              "",
              undefined,
              "fraud_warning",
            );
          } else if (decision.signupStep === "final_confirm") {
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

          // 프론트에 현재 signup 단계 알림
          socket.emit("signup", {
            signupStep: decision.signupStep,
            signupData: decision.signupData,
          });

          await sendTypedText(socket, decision.message);

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
              await subscribeUserToPlan({
                userId,
                planCode: preselectedPlanCode,
                selectedOptions: selectedBenefits,
                paymentMethod,
              });

              await recordConversionEvent(currentSessionId, "signup_completed");

              // signup_complete 카드 DB 저장
              await saveMessage(
                currentSessionId,
                "ai",
                "",
                undefined,
                "signup_complete",
              );

              socket.emit("signup_complete", {
                planCode: preselectedPlanCode,
                planName: plan.name,
                monthlyFee: plan.discountFee ?? plan.monthlyFee,
                paymentMethod,
              });

              // 가입 완료 후 signupData 초기화 (재가입 시 정보 재수집을 위해)
              signupCollectedData = undefined;
              await updateSignupCollectedData(currentSessionId, {});

              console.log(
                `✅ 가입 완료: userId=${userId}, plan=${preselectedPlanCode}`,
              );
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.error("가입 DB 처리 에러:", errMsg, err);
              socket.emit("error", "가입 처리 중 오류가 발생했습니다.");
            }
          }

          socket.emit("done");
          return;
        }

        // ── 기존 추천 플로우 ────────────────────────────────────────────────────
        const currentPlan = userId ? await getCurrentPlan(userId) : null;
        const candidates = await getPlanCandidates(currentPlan?.planCode);

        const { decision, interactionId } = await getChatDecision({
          message,
          previousInteractionId,
          surveyContext,
          collectedInfo,
          plans: candidates,
          promptContent,
          currentPlanCode: currentPlan?.planCode ?? null,
        });

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

        await sendTypedText(socket, decision.message);

        if (cards.length > 0) {
          socket.emit("plans", cards);
        }

        if (decision.action === "ask" && decision.quickReplies?.length) {
          socket.emit("quickReplies", decision.quickReplies);
        }

        socket.emit("done");
      } catch (aiError) {
        console.error("AI 채팅 처리 에러:", aiError);
        socket.emit("error", "AI 서버 연결에 실패했습니다.");
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
