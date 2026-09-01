export interface SessionListQuery {
  startDate?: string;
  endDate?: string;
  status: "all" | "completed" | "dropped";
  dropStage?: string;
  promptVersion?: string;
  // 지정 안 하면 동의 여부와 무관하게 전체 조회. false는 미응답(null) 포함
  chatLogConsent?: boolean;
  page: number;
  limit: number;
}

export interface SessionListItem {
  sessionId: string;
  userName: string;
  status: "completed" | "dropped";
  dropStage: string | null;
  dropStageLabel: string | null;
  promptVersion: string | null;
  createdAt: Date;
  duration: number;
  chatLogConsent: boolean;
}

export interface SessionListResponse {
  totalCount: number;
  completedCount: number;
  droppedCount: number;
  page: number;
  limit: number;
  sessions: SessionListItem[];
}

export interface SessionDetailMessage {
  messageId: string;
  sender: "user" | "ai";
  content: string;
  createdAt: Date;
}

export interface SessionDetailResponse {
  sessionId: string;
  userName: string;
  status: "completed" | "dropped";
  dropStage: string | null;
  dropStageLabel: string | null;
  promptVersion: string | null;
  createdAt: Date;
  duration: number;
  // 사용자가 채팅 기록 열람에 동의하지 않았으면 messages는 빈 배열로 내려감
  chatLogConsent: boolean;
  messages: SessionDetailMessage[];
}
