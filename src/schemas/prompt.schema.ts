export interface ActivePromptResponse {
  versionId: string;
  version: string;
  content: string;
  isActive: boolean;
  deployedAt: Date;
  deployedBy: string;
  conversionRate: number;
  sessionCount: number;
  charCount: number;
}

export interface CreatePromptResponse {
  versionId: string;
  version: string;
  content: string;
  summary: string;
  isActive: boolean;
  deployedAt: Date;
  deployedBy: string;
}

export interface PromptHistoryItem {
  versionId: string;
  version: string;
  summary: string;
  deployedAt: Date;
  deployedBy: string;
  conversionRate: number;
  conversionRateChange: number | null;
  sessionCount: number;
  isActive: boolean;
}

export interface PromptHistoryResponse {
  versions: PromptHistoryItem[];
}

export interface PromptDetailResponse {
  versionId: string;
  version: string;
  content: string;
  summary: string;
  deployedAt: Date;
  deployedBy: string;
  conversionRate: number;
  sessionCount: number;
  isActive: boolean;
  charCount: number;
}

export interface ActivatePromptResponse {
  versionId: string;
  version: string;
  isActive: boolean;
  deployedAt: Date;
  deployedBy: string;
  message: string;
}
