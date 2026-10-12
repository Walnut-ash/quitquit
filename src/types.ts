export type EmploymentStatus =
  "在职" | "准备离职" | "正在协商离职" | "已经离职";
export interface WorkProfile {
  id: string;
  employmentStatus: EmploymentStatus;
  company?: string;
  role?: string;
  startDate?: string;
  city?: string;
}
export type Mood =
  "happy" | "okay" | "neutral" | "tired" | "angry" | "anxious" | "sad";
/**
 * 每日记录是「状态 + 日记 + 对话 + 结构化整理」的统一载体。
 * 状态只有 mood 一项，也是「今天」页面的主入口。
 * 用户也可以完全不选心情，只写一句话。
 * 用 `hasStatus()`（constants.ts）判断当天是否填过状态。
 */
export interface DailyEntry {
  id: string;
  date: string;
  mood?: Mood;
  /** 用户日记原文（当天所有用户输入的合并，不含 AI 生成内容） */
  content: string;
  /** 输入框里还没发送的文字，刷新后要恢复 */
  draftText?: string;
  tags: string[];
  /** 当天对话的归属，一条每日记录对应一个会话 */
  conversationId: string;
  /** 当天产生的事件候选与已确认事件 */
  eventIds: string[];
  /** 当天产生的材料建议 */
  suggestionIds: string[];
  /** AI 今日总结，与用户原文分开保存 */
  aiSummary?: string;
  createdAt: string;
  updatedAt: string;
}
export type Attention = "normal" | "watch" | "priority";
export type EventSource = "daily" | "chat" | "manual" | "emergency";
export interface EventUpdate {
  id: string;
  content: string;
  createdAt: string;
}
export interface WorkEvent {
  id: string;
  title: string;
  occurredAt: string;
  people: string[];
  description: string;
  status: "draft" | "confirmed" | "dismissed";
  attention: Attention;
  sourceType: EventSource;
  sourceId?: string;
  /** 支持这条候选的原始消息与引用；用户确认不等于独立核实 */
  sourceMessageIds?: string[];
  sourceQuote?: string;
  materialIds: string[];
  updates: EventUpdate[];
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export type MaterialType =
  | "contract"
  | "offer"
  | "jd"
  | "salary"
  | "attendance"
  | "performance"
  | "hr"
  | "meeting"
  | "project"
  | "notice"
  | "other";
export type MaterialStatus = "pending" | "saved_externally" | "uploaded";
export interface Material {
  id: string;
  name: string;
  type: MaterialType;
  status: MaterialStatus;
  coverageStart?: string;
  coverageEnd?: string;
  isCurrent: boolean;
  eventIds: string[];
  fileId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  sha256?: string;
  uploadedAt?: string;
  externalLocationNote?: string;
  extractionDraft?: string;
  confirmedExtraction?: string;
  extractionStatus: "none" | "draft" | "confirmed";
  note?: string;
  createdAt: string;
  updatedAt: string;
}
export interface MaterialSuggestion {
  id: string;
  /**
   * 关联的事件。可以为空：材料收集**不以确认事件为前提**，
   * 建议先挂在当天的每日记录上，事件确认后再建立事件关联。
   */
  eventId?: string;
  /** 建议来源的那一天（用于回顾页展示与按天归组） */
  entryId?: string;
  type: MaterialType;
  title: string;
  reason: string;
  coverageStart?: string;
  coverageEnd?: string;
  status: "pending" | "completed" | "deferred" | "not_needed";
  /** 时间敏感事项：界面上突出显示，建议优先保存 */
  priority?: boolean;
  resolvedMaterialId?: string;
  createdAt: string;
}
export type EmergencyCategory =
  | "termination"
  | "resignation"
  | "sign"
  | "transfer"
  | "access"
  | "salary"
  | "other";
export interface EmergencySession {
  id: string;
  category: EmergencyCategory;
  answers: Record<string, string>;
  factsDraft: string;
  priority: "routine" | "priority" | "urgent";
  priorityReasons: string[];
  eventId?: string;
  /** 发起问卷的日期，完成后可以回到当天的记录 */
  date?: string;
  createdAt: string;
}
export type MessageStatus = "sending" | "sent" | "failed";
export interface ChatMessage {
  id: string;
  /** 与 DailyEntry.conversationId 对应，不同日期不混在一起 */
  conversationId: string;
  /** 消息所属的每日记录，每日记录是对话的来源 */
  dailyEntryId: string;
  role: "user" | "assistant";
  content: string;
  provider?: "api" | "demo" | "local";
  model?: string;
  replyToMessageId?: string;
  /** 本条消息插入的事件候选卡片 */
  candidateEventIds?: string[];
  /** 本条消息插入的材料建议卡片 */
  suggestionIds?: string[];
  /** 时间敏感时展示「整理紧急事项」卡片 */
  emergency?: boolean;
  /** 已确认事件被新消息补充时，展示「追加进展」建议 */
  updateSuggestionEventId?: string;
  /** AI 需要先澄清 1–2 个问题：下一条用户消息用于补全这个候选事件 */
  clarify?: EventInput;
  status: MessageStatus;
  createdAt: string;
}
export interface MockConfig {
  delayMs: number;
  failNext: boolean;
}
export interface AppData {
  profile: WorkProfile | null;
  onboarded: boolean;
  isDemo: boolean;
  entries: DailyEntry[];
  events: WorkEvent[];
  materials: Material[];
  suggestions: MaterialSuggestion[];
  emergencies: EmergencySession[];
  messages: ChatMessage[];
  notificationEnabled: boolean;
  mockConfig: MockConfig;
}
export type EventInput = Pick<
  WorkEvent,
  "title" | "occurredAt" | "people" | "description" | "attention" | "sourceType"
> & { sourceId?: string; sourceMessageIds?: string[]; sourceQuote?: string };
export type MaterialInput = Omit<Material, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};
/** 当天状态（只有情绪），与对话分开提交 */
export type DailyStatusInput = Pick<DailyEntry, "date" | "mood">;
export type DailyInput = DailyStatusInput &
  Pick<DailyEntry, "content" | "tags">;
/** 消息内容（id / 时间 / 状态由 store 生成） */
export type ChatMessageInput = Omit<
  ChatMessage,
  "id" | "createdAt" | "status"
> & { status?: MessageStatus };
