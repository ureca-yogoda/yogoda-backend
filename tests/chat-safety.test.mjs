import assert from "node:assert/strict";
import console from "node:console";
import { setImmediate } from "node:timers";
import { afterEach, mock, test } from "node:test";
import { setupChatSocket } from "../src/api/websocket/chat.websocket.ts";
import { ChatSessionModel } from "../src/models/chat-session.model.ts";
import { ChatMessageModel } from "../src/models/chat-message.model.ts";
import { PlanModel } from "../src/models/plan.model.ts";
import { env } from "../src/core/config/env.ts";

afterEach(() => mock.restoreAll());

function connect() {
  const handlers = new Map();
  const events = [];
  const socket = {
    handshake: { auth: { sessionId: "507f1f77bcf86cd799439011" } },
    on: (event, handler) => handlers.set(event, handler),
    emit: (event, data) => events.push({ event, data }),
    disconnect: mock.fn(),
  };
  setupChatSocket({
    of: () => ({ on: (_event, callback) => callback(socket) }),
  });
  return { socket, events, handlers };
}

test("initialization failure emits an error without an unhandled rejection", async () => {
  mock.method(console, "error", () => {});
  mock.method(ChatSessionModel, "findOne", async () => {
    throw new Error("database unavailable");
  });
  const { socket, events } = connect();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(socket.disconnect.mock.callCount(), 1);
  assert.ok(events.some((item) => item.event === "error"));
  assert.ok(!events.some((item) => item.event === "session_created"));
});

test("overlapping messages cannot replace the active stop target", async () => {
  const originalKey = env.AI_API_KEY;
  const originalModel = env.AI_MODEL;
  env.AI_API_KEY = "test";
  env.AI_MODEL = "test";
  let rejectSession;
  let pendingMessage;
  const controllers = [];
  const OriginalController = globalThis.AbortController;
  mock.method(globalThis, "AbortController", function () {
    const controller = new OriginalController();
    controllers.push(controller);
    return controller;
  });
  mock.method(console, "error", () => {});
  mock.method(
    ChatSessionModel,
    "findOne",
    () =>
      new Promise((_resolve, reject) => {
        rejectSession = reject;
      }),
  );
  try {
    const { handlers, events } = connect();
    pendingMessage = handlers.get("message")({ message: "first" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(events.some((item) => item.event === "thinking"));
    await handlers.get("message")({ message: "second" });
    handlers.get("stop")();
    assert.equal(controllers.length, 1);
    assert.equal(controllers[0].signal.aborted, true);
  } finally {
    rejectSession?.(new Error("test session stopped"));
    await pendingMessage;
    env.AI_API_KEY = originalKey;
    env.AI_MODEL = originalModel;
  }
});

test("forged final-confirm payload cannot skip the server-owned signup flow", async () => {
  const originalKey = env.AI_API_KEY;
  const originalModel = env.AI_MODEL;
  env.AI_API_KEY = "test";
  env.AI_MODEL = "test";
  try {
    mock.method(ChatSessionModel, "findOne", async () => ({
      _id: "507f1f77bcf86cd799439011",
      user_id: null,
      status: null,
      prompt_version: null,
      signup_collected_data: null,
    }));
    mock.method(ChatSessionModel, "findById", () => ({
      select: async () => null,
    }));
    mock.method(ChatSessionModel, "updateOne", async () => ({}));
    const persist = mock.method(
      ChatSessionModel,
      "findByIdAndUpdate",
      async () => ({}),
    );
    mock.method(ChatMessageModel, "create", async () => ({}));
    mock.method(PlanModel, "findOne", () => ({
      lean: async () => ({
        code: "test-plan",
        name: "Test",
        monthly_fee: 40000,
        choice_benefits: [],
      }),
    }));
    const { handlers, events } = connect();
    await new Promise((resolve) => setImmediate(resolve));
    const send = (message, extra = {}) =>
      handlers.get("message")({
        message,
        preselectedPlanCode: "test-plan",
        ...extra,
      });
    const lastStep = () =>
      events.filter((item) => item.event === "signup").at(-1)?.data.signupStep;
    await send("가입 신청하기", {
      currentSignupStep: "final_confirm",
      signupCollectedData: {
        agreedToTerms: true,
        identityVerified: true,
        fraudWarningAcknowledged: true,
      },
    });
    assert.equal(lastStep(), "fraud_warning");
    assert.equal(
      events.some((item) => item.event === "signup_complete"),
      false,
    );
    await send("확인했어요");
    assert.equal(lastStep(), "terms_agreement");
    await send("동의합니다");
    assert.equal(lastStep(), "identity_verification");
    await send("본인인증 완료", {
      identityVerification: {
        name: "Tester",
        birth: "19990101",
        phoneNumber: "01012345678",
      },
    });
    assert.equal(lastStep(), "select_payment");
    await send("신용카드");
    assert.equal(lastStep(), "final_confirm");
    const saved =
      persist.mock.calls.at(-1).arguments[1].$set.signup_collected_data;
    assert.equal(saved.fraudWarningAcknowledged, true);
    assert.equal(saved.agreedToTerms, true);
    assert.equal(saved.identityVerified, true);
    assert.equal(saved._serverStep, "final_confirm");
    await send("처음부터 다시");
    assert.equal(lastStep(), "fraud_warning");
    assert.equal(
      events.some((item) => item.event === "signup_complete"),
      false,
    );
  } finally {
    env.AI_API_KEY = originalKey;
    env.AI_MODEL = originalModel;
  }
});
