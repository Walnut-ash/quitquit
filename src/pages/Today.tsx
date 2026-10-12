import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Companion,
  Loader2,
  MoodFace,
  RefreshCw,
  Send,
  ShieldAlert,
  TodayHero,
} from "../components/doodles";
import { useAppStore } from "../store/useAppStore";
import { aiService, parsePeople, resolveDate } from "../services/ai";
import { useBackendPreferences } from "../services/backend";
import { useDiskSyncStatus } from "../services/disk-sync";
import {
  requirementsForChange,
  pendingSuggestions,
  hasPendingWork,
} from "../services/materials";
import {
  Button,
  Collapsible,
  LoadingState,
  Modal,
  RequireProfile,
  SectionTitle,
  useToast,
} from "../components/ui";
import { EventEditModal, MoodPicker } from "../components/cards";
import {
  DraftRow,
  EmergencyCard,
  EventPromptCard,
  SuggestionCard,
  UpdateSuggestionCard,
} from "../components/conversation";
import {
  ATTENTION,
  QUICK_TOPICS,
  MOODS,
  addDays,
  dateWithWeekday,
  formatDate,
  hasStatus,
  isFuture,
  today,
} from "../constants";
import type { DailyEntry, MaterialSuggestion, Mood, WorkEvent } from "../types";

type SaveState = "idle" | "saving" | "saved" | "error";
const SAVE_TEXT: Record<SaveState, string> = {
  idle: "未保存",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const relativeLabel = (date: string) =>
  date === today()
    ? "今天"
    : date === addDays(today(), -1)
      ? "昨天"
      : date === addDays(today(), 1)
        ? "明天"
        : "";
/** 顶部的一句短问候：只按当前时间挑一句，不堆文案 */
const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "夜深了，慢慢写。";
  if (h < 11) return "早上好，今天也记一句吧。";
  if (h < 14) return "中午好，随手记一下。";
  if (h < 18) return "下午好，今天还顺利吗？";
  if (h < 23) return "晚上好，把今天放下来。";
  return "夜深了，慢慢写。";
};

/** 路由入口：/today 打开今天，/today/:date 打开指定日期 */
export default function TodayPage() {
  const { date: dateParam } = useParams();
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : today();
  // 用 key 让切换日期时表单与输入框状态自然重置
  return <TodayWorkspace key={date} date={date} />;
}

function TodayWorkspace({ date }: { date: string }) {
  const navigate = useNavigate();
  const toast = useToast();

  const entries = useAppStore((s) => s.entries);
  const messages = useAppStore((s) => s.messages);
  const events = useAppStore((s) => s.events);
  const suggestions = useAppStore((s) => s.suggestions);
  const materials = useAppStore((s) => s.materials);
  const ensureEntry = useAppStore((s) => s.ensureEntry);
  const setStatusAction = useAppStore((s) => s.setStatus);
  const setDraftText = useAppStore((s) => s.setDraftText);
  const setSummary = useAppStore((s) => s.setSummary);
  const appendMessage = useAppStore((s) => s.appendMessage);
  const setMessageStatus = useAppStore((s) => s.setMessageStatus);
  const prefs = useBackendPreferences();
  const diskStatus = useDiskSyncStatus();
  const addDraft = useAppStore((s) => s.addDraft);
  const suggest = useAppStore((s) => s.suggest);
  const consume = useAppStore((s) => s.consumeMockConfig);

  const entry = entries.find((e) => e.date === date);
  const conversationId = entry?.conversationId ?? `conv-${date}`;
  const dayMessages = useMemo(
    () => messages.filter((m) => m.dailyEntryId === entry?.id),
    [messages, entry?.id],
  );

  /* ---------- 今天的状态：心情是唯一的主入口 ---------- */
  const [mood, setMood] = useState<Mood | null>(entry?.mood ?? null);
  const [saveState, setSaveState] = useState<SaveState>(
    entry && (hasStatus(entry) || entry.content) ? "saved" : "idle",
  );
  const [summaryState, setSummaryState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  /** 保存成功的一次性反馈：让陪伴角色轻轻动一下，不持续动画 */
  const [justSaved, setJustSaved] = useState(false);

  const dirty = (entry?.mood ?? null) !== mood;

  const generateSummary = async (
    entryId: string,
    userText: string,
    status: { mood?: Mood },
  ) => {
    setSummaryState("loading");
    try {
      const summary = await aiService.summarize(
        { date, ...status },
        userText,
        consume(),
      );
      setSummary(entryId, summary);
      setSummaryState("idle");
    } catch {
      setSummaryState("error");
    }
  };

  /** 普通日子的最短路径：选一个心情 → 保存 → 完成 */
  const saveToday = async () => {
    if (!mood) return;
    setSaveState("saving");
    try {
      const id = setStatusAction({ date, mood });
      setSaveState("saved");
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2600);
      toast("今天已经记下来了");
      await generateSummary(id, entry?.content ?? "", { mood });
    } catch (e) {
      setSaveState("error");
      toast((e as Error).message);
    }
  };

  /* ---------- 工作记录与 AI 对话 ---------- */
  const [text, setText] = useState(entry?.draftText ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<WorkEvent | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const composing = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  // 打开历史日期时直接定位到最新消息；之后只在自己发送后跟随
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, []);

  useEffect(() => {
    useAppStore.getState().messages.filter((m) => m.dailyEntryId === entry?.id && m.status === "sending").forEach((m) => setMessageStatus(m.id, "failed"));
  // 页面重载时，挂起请求不会自动重发或丢失原文。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const lastMessage = [...dayMessages].reverse().find((m) => m.role === "assistant");
  const awaiting =
    lastMessage?.role === "assistant" ? lastMessage.clarify : undefined;

  const dayEvents = entry
    ? entry.eventIds
        .map((id) => events.find((e) => e.id === id))
        .filter((e): e is WorkEvent => Boolean(e))
    : [];
  const drafts = dayEvents.filter((e) => e.status === "draft");
  const confirmed = dayEvents.filter((e) => e.status === "confirmed");
  const daySuggestions = entry
    ? entry.suggestionIds
        .map((id) => suggestions.find((s) => s.id === id))
        .filter((s): s is MaterialSuggestion => Boolean(s))
    : [];
  const openSuggestions = pendingSuggestions(daySuggestions);

  const send = async (raw: string, retryId?: string) => {
    const value = raw.trim();
    if (!value || sending) return;
    setSending(true);
    setError("");
    setText("");
    let userMessageId = retryId || "";
    try {
    const entryId = ensureEntry(date);
    setDraftText(entryId, "");
    if (retryId) setMessageStatus(retryId, "sending");
    else userMessageId = appendMessage({
      role: "user",
      content: value,
      conversationId,
      dailyEntryId: entryId,
      status: "sending",
    });
    const cfg = consume();
      // 上一条 AI 消息在补问时间 → 这条用户输入用于补全候选事件
      if (awaiting) {
        const occurredAt = resolveDate(value, date) ?? date;
        const people = parsePeople(value);
        const draftId = addDraft({
          ...awaiting,
          occurredAt,
          people: Array.from(new Set([...awaiting.people, ...people])),
          // 用户的补充也要留在描述里，不能丢
          description: `${awaiting.description}\n补充：${value}`,
          sourceId: entryId,
          sourceMessageIds: [...(awaiting.sourceMessageIds ?? []), userMessageId],
        });
        setMessageStatus(userMessageId, "sent");
        const reqs = requirementsForChange(
          `${entry?.content ?? ""} ${value}`,
          entryId,
          date,
        );
        const suggestionIds = reqs.length ? suggest(reqs, entryId) : [];
        appendMessage({
          role: "assistant",
          content: "已按你补充的日期在本地整理候选，放在「今日整理」里；这不是模型核实的事实。请核对后确认。",
          provider: "local",
          replyToMessageId: userMessageId,
          conversationId,
          dailyEntryId: entryId,
          suggestionIds,
          candidateEventIds: [draftId],
        });
      } else {
        const context = {
          date,
          entryId,
          userText: (useAppStore.getState().entries.find((e) => e.id === entryId)?.content || value).slice(-16000),
          history: useAppStore.getState().messages.filter((m) => m.dailyEntryId === entryId && m.id !== userMessageId && m.status === "sent").slice(-20).map((m) => ({ role: m.role, content: m.content })),
          confirmedEvents: confirmed,
          draftTitles: drafts.map((d) => d.title),
          materials,
        };
        const reply = await aiService.reply(value, context, cfg);
        setMessageStatus(userMessageId, "sent");
        const suggestionIds = reply.requirements
          ? suggest(reply.requirements, entryId)
          : [];
        const candidateEventIds = reply.candidateEvent
          ? [addDraft({ ...reply.candidateEvent, sourceId: entryId, sourceMessageIds: [userMessageId], sourceQuote: reply.candidateEvent.sourceQuote || value })]
          : [];
        appendMessage({
          role: "assistant",
          content: reply.content,
          provider: reply.provider,
          model: reply.model,
          replyToMessageId: userMessageId,
          conversationId,
          dailyEntryId: entryId,
          suggestionIds,
          // 一般候选只进「今日整理」，不在这里打扰
          candidateEventIds: reply.noteworthy ? candidateEventIds : [],
          emergency: reply.emergency,
          updateSuggestionEventId: reply.updateSuggestionEventId,
          // 必须带上：下一条用户消息要用来补全这个候选事件
          clarify: reply.clarify ? { ...reply.clarify, sourceMessageIds: [userMessageId] } : undefined,
        });
      }
      // 已发送的内容立即算作已保存
      setSaveState("saved");
      // 继续聊天可以更新 AI 总结，但不会改写已确认事件
      await generateSummary(
        entryId,
        useAppStore.getState().entries.find((e) => e.id === entryId)?.content || value,
        { mood: entry?.mood },
      );
      requestAnimationFrame(() =>
        bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }),
      );
    } catch (e) {
      // 失败时保留这条输入，标记为待重试
      if (userMessageId) setMessageStatus(userMessageId, "failed");
      else setText(value);
      setSaveState(userMessageId ? "saved" : "error");
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const retry = async (messageId: string, content: string) => {
    await send(content, messageId);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    // 中文输入法组合期间的回车用于选词，不能当成发送
    if (composing.current || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void send(text);
  };

  const shiftDate = (days: number) => {
    const next = addDays(date, days);
    if (isFuture(next)) return;
    navigate(`/today/${next}`);
  };

  return (
    <RequireProfile>
      <div className="page-wide">
        {/*
          顶部插画：占移动端首屏约 20%，不占满首屏，也不挡下面的主要操作。
          下面的日期与问候才是信息起点。
        */}
        <div className="hero-scene mb-1 h-[170px] w-full sm:h-[190px]">
          <TodayHero />
        </div>
        <p className="hand mb-4 text-center text-sm text-[var(--color-muted)]">
          {date === today() ? greeting() : `回到 ${dateWithWeekday(date)}`}
        </p>

        {/* 日期、切换、保存状态、当天已确认事件 */}
        <header className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="kbd-focus tap-square rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-fill)]"
              onClick={() => shiftDate(-1)}
              aria-label="前一天"
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <h1 className="leading-tight">{dateWithWeekday(date)}</h1>
              <p className="faint">
                {relativeLabel(date) || "历史记录"}
                {dirty ? " · 状态有未保存的修改" : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={isFuture(addDays(date, 1))}
              className="kbd-focus tap-square rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-fill)] disabled:opacity-40"
              onClick={() => shiftDate(1)}
              aria-label="后一天"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              role="status"
              className={`badge ${
                saveState === "saved"
                  ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                  : saveState === "error"
                    ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                    : "bg-[var(--color-fill-2)] text-[var(--color-body)]"
              }`}
            >
              {saveState === "saving" && (
                <Loader2 size={12} className="animate-spin" />
              )}
              {saveState === "saved" && <Check size={12} />}
              {saveState === "error" && <AlertCircle size={12} />}
              {SAVE_TEXT[saveState]}
            </span>
            <label className="sr-only" htmlFor="jump-date">
              跳到指定日期
            </label>
            <input
              id="jump-date"
              type="date"
              className="input w-auto"
              value={date}
              max={today()}
              onChange={(e) => {
                if (e.target.value) navigate(`/today/${e.target.value}`);
              }}
            />
            <Button size="sm" onClick={() => setEventsOpen(true)}>
              <CalendarDays size={15} />
              已确认事件
              {confirmed.length > 0 ? `（${confirmed.length}）` : ""}
            </Button>
          </div>
        </header>

        {/* 移动端：今日摘要与今日整理都是折叠面板 */}
        <div className="mb-4 stack lg:hidden">
          <Collapsible title="今日摘要">
            <DaySummary
              entry={entry}
              drafts={drafts}
              confirmed={confirmed}
              suggestions={daySuggestions}
              summaryState={summaryState}
              onRetrySummary={() =>
                entry && generateSummary(entry.id, entry.content, entry)
              }
            />
          </Collapsible>
          <Collapsible
            title={`今日整理${drafts.length ? `（待确认 ${drafts.length}）` : ""}`}
            defaultOpen={false}
          >
            <DayOrganize
              drafts={drafts}
              confirmed={confirmed}
              onEdit={setEditing}
            />
          </Collapsible>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="stack">
            {/* 今天的状态：心情是主入口，选完就能保存 */}
            <section className="panel stack" aria-label="今天的状态">
              <SectionTitle
                title="今天的状态"
                subtitle="选一个心情就能保存，也可以直接写一句话。"
                action={<span className="badge">本地日记</span>}
              />
              <MoodPicker value={mood} onChange={setMood} />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  disabled={!mood || saveState === "saving"}
                  onClick={saveToday}
                >
                  {saveState === "saving" ? "保存中…" : "保存今天"}
                </Button>
                {justSaved ? (
                  <span className="flex items-center gap-1.5">
                    <Companion
                      size={30}
                      simple
                      className="animate-pop motion-reduce:animate-none"
                    />
                    <span className="hand text-sm text-[var(--color-ink)]">
                      今天已经记下来了。
                    </span>
                  </span>
                ) : !mood ? (
                  <p className="small muted">
                    先选一个心情，或者直接在下面写一句。
                  </p>
                ) : null}
              </div>
              {saveState === "error" && (
                <p className="error">
                  没有保存成功，你的选择还在页面上，可以直接重试。
                </p>
              )}
            </section>

            {/* 工作记录与 AI 对话 */}
            <section className="panel stack" aria-label="工作记录与 AI 对话">
              <SectionTitle
                title="工作记录与 AI 对话"
                subtitle="想到什么就说什么，可以分几次慢慢写。"
                action={<span className="badge">{prefs.aiMode === "demo" ? "本地演示规则" : "真实 API · 需配置"}</span>}
              />

              {dayMessages.length === 0 && (
                <div className="stack">
                  <p className="muted">
                    想到什么就写一句，写不下去也可以只选一个心情。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_TOPICS.map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        className="chip kbd-focus"
                        onClick={() => void send(topic)}
                        disabled={sending}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="stack" data-testid="conversation">
                {dayMessages.map((message, index) => {
                  const isLast = index === dayMessages.length - 1;
                  return (
                    <div
                      key={message.id}
                      ref={isLast ? bottomRef : undefined}
                      className="stack-sm"
                    >
                      {message.role === "user" ? (
                        <div className="bubble-user max-w-[85%] whitespace-pre-line">
                          {message.content}
                          {message.status === "failed" && (
                            <span className="mt-1 block text-xs text-[var(--color-danger)]">
                              发送失败，未收到回应
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          {/* 助手消息带一个小小的陪伴角色头像 */}
                          <Companion size={28} simple className="mt-0.5 shrink-0" />
                          <div className="bubble-assistant min-w-0 max-w-[92%] whitespace-pre-line">
                            <p className="faint mb-1">{message.provider === "api" ? `模型回复 · ${message.model || "API"}` : message.provider === "local" ? "本地整理 · 非模型回复" : "历史演示回复 · 非真实 AI"}</p>
                            {message.content}
                          </div>
                        </div>
                      )}
                      {message.status === "failed" && (
                        <div className="button-row">
                          <Button
                            size="sm"
                            onClick={() => void retry(message.id, message.content)}
                          >
                            <RefreshCw size={14} />
                            重试这条
                          </Button>
                        </div>
                      )}
                      {message.emergency && <EmergencyCard date={date} />}
                      {message.candidateEventIds?.map((id) => {
                        const event = events.find((e) => e.id === id);
                        return event ? (
                          <EventPromptCard key={id} event={event} />
                        ) : null;
                      })}
                      {message.suggestionIds?.map((id) => {
                        const suggestion = suggestions.find((s) => s.id === id);
                        return suggestion ? (
                          <SuggestionCard key={id} suggestion={suggestion} />
                        ) : null;
                      })}
                      {message.updateSuggestionEventId &&
                        (() => {
                          const event = events.find(
                            (e) => e.id === message.updateSuggestionEventId,
                          );
                          return event ? (
                            <UpdateSuggestionCard
                              event={event}
                              content={message.content}
                            />
                          ) : null;
                        })()}
                    </div>
                  );
                })}
                {sending && <LoadingState label="正在整理…" />}
              </div>

              {error && (
                <div className="error stack">
                  <p>{error}</p>
                  <p className="small">
                    这条输入已经保留在对话里，可以点「重试这条」再发一次。
                  </p>
                </div>
              )}

              {/* 输入框：像一页干净的日记纸，移动端吸附在底部导航之上 */}
              <div className="composer-dock">
                <form
                  className="paper-grid stack-sm border-[1.5px] border-[var(--color-stroke)] p-2"
                  style={{
                    borderRadius: "15px 13px 16px 12px / 13px 16px 12px 15px",
                  }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(text);
                  }}
                >
                  <label className="sr-only" htmlFor="message">
                    记录今天的工作
                  </label>
                  <textarea
                    id="message"
                    className="min-h-16 w-full resize-none bg-transparent px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-faint)]"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      // 还没发送的文字也留着，刷新后能接着写
                      if (entry) setDraftText(entry.id, e.target.value);
                      else if (e.target.value)
                        setDraftText(ensureEntry(date), e.target.value);
                    }}
                    onKeyDown={onKeyDown}
                    onCompositionStart={() => {
                      composing.current = true;
                    }}
                    onCompositionEnd={() => {
                      composing.current = false;
                    }}
                    placeholder="今天工作怎么样？随便记一句。"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="faint">Enter 发送 · Shift + Enter 换行</span>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={sending || !text.trim()}
                    >
                      <Send size={14} />
                      {sending ? "发送中" : "发送"}
                    </Button>
                  </div>
                </form>
              </div>
              <p className="faint">
                {diskStatus.message}。API 模式会将授权的上下文发送给模型服务，请先去除敏感信息；候选事件需你核对确认。
              </p>
            </section>

            {/* 今日留痕建议：材料收集不以确认事件为前提 */}
            <section
              className="panel stack"
              aria-label="今日留痕建议"
              data-testid="day-suggestions"
            >
              <SectionTitle
                title="今日留痕建议"
                subtitle="只列出确实缺失的部分。可以先保存材料，不必先确认事件。"
                action={
                  <Button to="/materials/upload" variant="ghost" size="sm">
                    直接上传
                  </Button>
                }
              />
              {daySuggestions.length ? (
                <div className="stack-sm">
                  {daySuggestions.map((s) => (
                    <SuggestionCard key={s.id} suggestion={s} />
                  ))}
                </div>
              ) : (
                <p className="muted">今天暂无特别需要补充的材料。</p>
              )}
              {hasPendingWork(daySuggestions) ? (
                <p className="faint">
                  有 {openSuggestions.length} 项待处理，不处理也可以直接结束今天的记录。
                </p>
              ) : (
                <p className="faint">
                  今天没有需要补充的材料，正常记录就好。
                </p>
              )}
            </section>

            {/* 紧急事项：次要操作，按需启动 */}
            <section className="panel stack">
              <SectionTitle
                title="需要的时候"
                subtitle="时间比较紧的事可以走一次结构化整理，由你自己决定什么时候开始。"
              />
              <div className="button-row">
                <Button to={`/emergency?date=${date}`} size="sm">
                  <ShieldAlert size={15} />
                  整理当前情况
                </Button>
                <Button to="/review" size="sm" variant="ghost">
                  <ClipboardList size={15} />
                  去回顾看看
                </Button>
              </div>
            </section>
          </div>

          {/* 桌面端：右侧可折叠摘要栏（今日摘要 + 今日整理） */}
          <aside className="no-print hidden lg:block">
            <div className="sticky top-6 stack">
              <Collapsible title="今日摘要" defaultOpen>
                <DaySummary
                  entry={entry}
                  drafts={drafts}
                  confirmed={confirmed}
                  suggestions={daySuggestions}
                  summaryState={summaryState}
                  onRetrySummary={() =>
                    entry && generateSummary(entry.id, entry.content, entry)
                  }
                />
              </Collapsible>
              <Collapsible
                title={`今日整理${drafts.length ? `（待确认 ${drafts.length}）` : ""}`}
              >
                <DayOrganize
                  drafts={drafts}
                  confirmed={confirmed}
                  onEdit={setEditing}
                />
              </Collapsible>
            </div>
          </aside>
        </div>
      </div>

      {editing && (
        <EventEditModal event={editing} onClose={() => setEditing(null)} />
      )}
      {eventsOpen && (
        <Modal
          title={`${formatDate(date)} 已确认事件`}
          onClose={() => setEventsOpen(false)}
        >
          <div className="stack">
            {confirmed.length ? (
              confirmed.map((event) => (
                <div key={event.id} className="list-row">
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="small muted">
                      {ATTENTION[event.attention]} ·{" "}
                      {event.people.join("、") || "未填写人物"}
                    </p>
                  </div>
                  <Button size="sm" to={`/events/${event.id}`}>
                    查看
                  </Button>
                </div>
              ))
            ) : (
              <p className="muted">
                这一天还没有已确认的事件。确认对话里的卡片后会出现在这里。
              </p>
            )}
          </div>
        </Modal>
      )}
    </RequireProfile>
  );
}

/** 今日整理：一般候选安静地待在这里，不打断记录 */
function DayOrganize({
  drafts,
  confirmed,
  onEdit,
}: {
  drafts: WorkEvent[];
  confirmed: WorkEvent[];
  onEdit: (event: WorkEvent) => void;
}) {
  return (
    <div className="stack-sm" data-testid="day-organize">
      {drafts.length ? (
        <>
          <p className="small muted">
            这些是从今天的记录里整理出来的，确认后才会进入回顾和报告。
          </p>
          <div className="stack-sm">
            {drafts.map((d) => (
              <DraftRow key={d.id} event={d} onEdit={() => onEdit(d)} />
            ))}
          </div>
        </>
      ) : (
        <p className="muted">今天没有待确认的整理结果。</p>
      )}
      {confirmed.length > 0 && (
        <div className="divider pt-3">
          <p className="faint">今天已记入回顾</p>
          <ul className="stack-sm">
            {confirmed.map((c) => (
              <li key={c.id} className="small">
                <span className="mr-1 text-[var(--color-success)]">✓</span>
                {c.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DaySummary({
  entry,
  drafts,
  confirmed,
  suggestions,
  summaryState,
  onRetrySummary,
}: {
  entry?: DailyEntry;
  drafts: WorkEvent[];
  confirmed: WorkEvent[];
  suggestions: MaterialSuggestion[];
  summaryState: "idle" | "loading" | "error";
  onRetrySummary: () => void;
}) {
  const pending = pendingSuggestions(suggestions);
  return (
    <div className="stack" data-testid="today-summary">
      <div>
        <p className="faint">今天的状态</p>
        {entry && hasStatus(entry) ? (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--color-body)]">
            <MoodFace mood={entry.mood!} size={20} />
            {MOODS[entry.mood!].label}
          </p>
        ) : (
          <p className="muted">还没选心情。</p>
        )}
      </div>
      <div className="divider pt-3">
        <p className="faint">AI 今日总结</p>
        {summaryState === "loading" ? (
          <LoadingState label="正在生成总结…" />
        ) : summaryState === "error" ? (
          <div className="stack-sm">
            <p className="error">总结生成失败，已保存的记录不受影响。</p>
            <Button size="sm" onClick={onRetrySummary}>
              重新生成
            </Button>
          </div>
        ) : (
          <p className="text-sm leading-relaxed">
            {entry?.aiSummary || "还没有总结。保存今天或聊几句就会生成。"}
          </p>
        )}
        <p className="faint mt-1">总结与你的原文分开保存，可以随时在回顾里对照。</p>
      </div>
      <div className="divider pt-3">
        <p className="faint">待确认的整理结果</p>
        {drafts.length ? (
          <ul className="stack-sm">
            {drafts.map((d) => (
              <li key={d.id} className="text-sm">
                ○ {d.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">没有待确认的内容。</p>
        )}
      </div>
      <div className="divider pt-3">
        <p className="faint">已记入回顾</p>
        {confirmed.length ? (
          <ul className="stack-sm">
            {confirmed.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="mr-1 text-[var(--color-success)]">✓</span>
                {c.title}
                <span className="faint ml-1">{ATTENTION[c.attention]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">还没有已确认的事件。</p>
        )}
      </div>
      <div className="divider pt-3">
        <p className="faint">待补充材料</p>
        {pending.length ? (
          <ul className="stack-sm">
            {pending.map((s) => (
              <li key={s.id} className="text-sm">
                {s.priority ? (
                  <span className="mr-1 text-[var(--color-warning)]">!</span>
                ) : (
                  "○ "
                )}
                {s.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">今天暂无特别需要补充的材料。</p>
        )}
      </div>
      {entry && (
        <p className="faint">
          本条记录创建于 {formatDate(entry.createdAt.slice(0, 10))}
        </p>
      )}
    </div>
  );
}
