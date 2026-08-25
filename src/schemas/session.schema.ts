export interface SessionListQuery {
  startDate?: string;
  endDate?: string;
  status: "all" | "completed" | "dropped";
  dropStage?: string;
  promptVersion?: string;
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
}

export interface SessionListResponse {
  totalCount: number;
  completedCount: number;
  droppedCount: number;
  page: number;
  limit: number;
  sessions: SessionListItem[];
}
