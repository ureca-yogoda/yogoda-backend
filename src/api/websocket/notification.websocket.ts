import { Server, Socket } from "socket.io";

import { verifyAccessToken } from "../../core/security/jwt.js";

// 유저별로 여러 탭/기기에서 접속할 수 있으므로, 유저 단위 room으로 묶어서 한 번에 push함
function userRoom(userId: string) {
  return `user:${userId}`;
}

let notificationNamespace: ReturnType<Server["of"]> | null = null;

/**
 * 알림 전용 소켓 네임스페이스를 셋업합니다.
 * 채팅 소켓과 달리, 로그인 사용자가 앱을 켜두는 동안 계속 연결을 유지하는 용도입니다.
 * (채팅 소켓은 메시지 한 번 주고받고 바로 끊기는 방식이라 알림 용도로는 재사용하기 어려움)
 *
 * 연결 시 auth.token으로 JWT를 검증해 유저를 식별하고, 이후 서버는 emitNotificationToUser로
 * 그 유저가 지금 접속 중이면 실시간으로, 접속 중이 아니면 다음 GET /api/notifications
 * 조회 시 확인하도록 흘려보냅니다(알림 자체는 항상 DB에 먼저 저장됨).
 */
export function setupNotificationSocket(io: Server) {
  notificationNamespace = io.of("/notifications");

  notificationNamespace.on("connection", (socket: Socket) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      socket.disconnect();
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      const userId = payload.userId as string | undefined;

      if (!userId) {
        socket.disconnect();
        return;
      }

      socket.join(userRoom(userId));
      if (typeof payload.exp === "number") {
        const expiry = setTimeout(
          () => socket.disconnect(),
          Math.max(0, payload.exp * 1000 - Date.now()),
        );
        expiry.unref();
        socket.once("disconnect", () => clearTimeout(expiry));
      }
    } catch (err) {
      console.error("알림 소켓 토큰 검증 실패:", err);
      socket.disconnect();
    }
  });
}

/**
 * 특정 유저가 지금 알림 소켓에 접속해 있다면 실시간으로 알림을 보냅니다.
 * 접속 중이 아니면 아무 일도 일어나지 않지만, 알림 자체는 이미 DB에 저장돼 있으므로
 * 다음에 GET /api/notifications를 조회할 때 정상적으로 확인할 수 있습니다.
 */
export function emitNotificationToUser(userId: string, payload: unknown) {
  notificationNamespace?.to(userRoom(userId)).emit("notification", payload);
}
