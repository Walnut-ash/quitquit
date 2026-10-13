import { useMemo, useState } from "react";
import { RiskPanel } from "../components/RiskPanel";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Companion,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Upload,
} from "../components/doodles";
import { useAppStore } from "../store/useAppStore";
import {
  Button,
  EmptyState,
  PageHeader,
  RequireProfile,
  SectionTitle,
} from "../components/ui";
import { EventCard, MaterialCard, SuggestionList } from "../components/cards";
import { DiaryMark, MoodFace } from "../components/doodles";
import {
  ATTENTION,
  MATERIAL_STATUS,
  MATERIAL_TYPES,
  MOODS,
  fullDate,
  hasRecord,
  monthRange,
  today,
} from "../constants";
import { pendingSuggestions } from "../services/materials";
import type { Attention, MaterialStatus, MaterialType, Mood } from "../types";

/**
 * 回顾：默认只展示日历、近期记录和已确认的重要事件。
 * 事件列表、材料库、待补充材料、报告都是次级入口，默认不堆满统计和待办。
 */
const TABS = [
  { key: "review", label: "回顾" },
  { key: "events", label: "事件" },
  { key: "materials", label: "材料" },
  { key: "pending", label: "待补充材料" },
];

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export default function ReviewPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "review";
  const navigate = useNavigate();
  const entries = useAppStore((s) => s.entries);
  const events = useAppStore((s) => s.events);
  const materials = useAppStore((s) => s.materials);
  const suggestions = useAppStore((s) => s.suggestions);
  const setTab = (key: string) => setParams({ tab: key });

  const [month, setMonth] = useState(today().slice(0, 7));
  const confirmed = events.filter((e) => e.status === "confirmed");
  const saved = materials.filter(
    (m) => m.status === "uploaded" || m.status === "saved_externally",
  );
  const pending = pendingSuggestions(suggestions);
  const [attention, setAttention] = useState<Attention | "all">("all");
  const [eventQuery, setEventQuery] = useState("");
  const [type, setType] = useState<MaterialType | "all">("all");
  const [status, setStatusFilter] = useState<MaterialStatus | "all">("all");
  const [materialQuery, setMaterialQuery] = useState("");

  const filteredEvents = useMemo(
    () =>
      confirmed
        .filter(
          (e) =>
            (attention === "all" || e.attention === attention) &&
            (!eventQuery ||
              `${e.title}${e.description}`
                .toLowerCase()
                .includes(eventQuery.toLowerCase())),
        )
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [confirmed, attention, eventQuery],
  );
  const filteredMaterials = useMemo(
    () =>
      materials
        .filter(
          (m) =>
            (type === "all" || m.type === type) &&
            (status === "all" || m.status === status) &&
            (!materialQuery ||
              m.name.toLowerCase().includes(materialQuery.toLowerCase())),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [materials, type, status, materialQuery],
  );

  // 「重要事件」= 优先处理 > 值得关注 > 普通，同级别按日期倒序
  const important = useMemo(() => {
    const rank: Record<Attention, number> = { priority: 0, watch: 1, normal: 2 };
    return [...confirmed]
      .sort(
        (a, b) =>
          rank[a.attention] - rank[b.attention] ||
          b.occurredAt.localeCompare(a.occurredAt),
      )
      .slice(0, 5);
  }, [confirmed]);

  // 近期记录：只展示真的写过东西的日子（只有草稿文字不算）
  const recent = useMemo(
    () =>
      [...entries]
        .filter(hasRecord)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 7),
    [entries],
  );

  return (
    <RequireProfile>
      <div className="page stack">
        <PageHeader
          title="回顾"
          subtitle="只有你确认过的内容才会出现在这里。"
          action={
            <Button to="/report" variant="primary">
              <FileText size={16} />
              生成报告
            </Button>
          }
        />

        <div className="tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={tab === item.key}
              className={`tab kbd-focus ${tab === item.key ? "tab-active" : ""}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
              {item.key === "pending" && pending.length > 0
                ? `（${pending.length}）`
                : ""}
            </button>
          ))}
        </div>

        {tab === "review" && (
          <div className="stack">
            <RiskPanel />
            {/* 情绪日历：点某一天直接回到那天的记录 */}
            <section className="panel stack">
              <MoodCalendar
                month={month}
                entries={entries}
                events={events}
                suggestions={suggestions}
                onPick={(date) => navigate(`/today/${date}`)}
                onShiftMonth={(delta) => setMonth((m) => shiftMonth(m, delta))}
                onBackToToday={() => setMonth(today().slice(0, 7))}
              />
            </section>

            {/* 近期记录 */}
            <section className="panel stack">
              <SectionTitle
                title="近期记录"
                action={
                  <Button to="/today" variant="ghost" size="sm">
                    去记录今天
                  </Button>
                }
              />
              {recent.length ? (
                <ul className="stack-sm">
                  {recent.map((e) => (
                    <li key={e.id} className="list-row">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {fullDate(e.date)}
                          {e.mood ? (
                            <span className="muted ml-2 inline-flex items-center gap-1 align-middle font-normal">
                              <MoodFace mood={e.mood} size={18} />
                              {MOODS[e.mood].label}
                            </span>
                          ) : null}
                        </p>
                        <p className="small muted truncate">
                          {e.content
                            ? e.content.split("\n")[0]
                            : "这一天只选了心情。"}
                        </p>
                      </div>
                      <Button size="sm" to={`/today/${e.date}`}>
                        查看
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="还没有记录"
                  description="从今天开始，选一个心情或者写一句话都算。"
                  action={
                    <Button variant="primary" to="/today">
                      去记录今天
                    </Button>
                  }
                />
              )}
            </section>

            {/* 已确认的重要事件 */}
            <section className="panel stack" data-testid="important-events">
              <SectionTitle
                title="重要事件"
                subtitle="只有你确认过的事实会出现在这里。"
                action={
                  <Button variant="ghost" size="sm" onClick={() => setTab("events")}>
                    全部事件
                  </Button>
                }
              />
              {important.length ? (
                <div className="stack">
                  {important.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              ) : (
                <p className="muted">
                  还没有已确认的事件。确认后的整理结果会出现在这里。
                </p>
              )}
            </section>

            {/* 次级入口：需要时再进 */}
            <section className="panel stack">
              <SectionTitle title="更多" subtitle="需要的时候再进来，不必每天都看。" />
              <div className="button-row">
                <Button size="sm" onClick={() => setTab("events")}>
                  <CalendarDays size={15} />
                  事件列表（{confirmed.length}）
                </Button>
                <Button size="sm" onClick={() => setTab("materials")}>
                  <Paperclip size={15} />
                  材料库（{saved.length}）
                </Button>
                <Button size="sm" onClick={() => setTab("pending")}>
                  待补充材料（{pending.length}）
                </Button>
                <Button size="sm" to="/report" variant="ghost">
                  <FileText size={15} />
                  报告
                </Button>
              </div>
            </section>
          </div>
        )}

        {tab === "events" && (
          <div className="stack">
            <div className="card stack">
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="attention">
                    关注程度
                  </label>
                  <select
                    id="attention"
                    className="input"
                    value={attention}
                    onChange={(e) =>
                      setAttention(e.target.value as Attention | "all")
                    }
                  >
                    <option value="all">全部</option>
                    {Object.entries(ATTENTION).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="q">
                    关键词搜索
                  </label>
                  <input
                    id="q"
                    className="input"
                    value={eventQuery}
                    onChange={(e) => setEventQuery(e.target.value)}
                    placeholder="搜索标题或描述"
                  />
                </div>
              </div>
              <div className="button-row">
                <Button variant="primary" to="/events/new">
                  <Plus size={16} />
                  新建事件
                </Button>
              </div>
              <p className="small muted">手动新建的事件会直接标记为已确认。</p>
            </div>
            {filteredEvents.length ? (
              filteredEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))
            ) : (
              <EmptyState
                title="没有匹配的事件"
                description="换一个筛选条件试试，或者新建一个。"
              />
            )}
          </div>
        )}

        {tab === "materials" && (
          <div className="stack">
            <div className="card stack">
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="type">
                    类型
                  </label>
                  <select
                    id="type"
                    className="input"
                    value={type}
                    onChange={(e) => setType(e.target.value as MaterialType | "all")}
                  >
                    <option value="all">全部</option>
                    {Object.entries(MATERIAL_TYPES).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="status">
                    状态
                  </label>
                  <select
                    id="status"
                    className="input"
                    value={status}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as MaterialStatus | "all")
                    }
                  >
                    <option value="all">全部</option>
                    {Object.entries(MATERIAL_STATUS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="mq">
                    关键词搜索
                  </label>
                  <input
                    id="mq"
                    className="input"
                    value={materialQuery}
                    onChange={(e) => setMaterialQuery(e.target.value)}
                    placeholder="搜索材料名称"
                  />
                </div>
              </div>
              <div className="button-row">
                <Button variant="primary" to="/materials/upload">
                  <Upload size={16} />
                  上传材料
                </Button>
              </div>
            </div>
            {filteredMaterials.length ? (
              filteredMaterials.map((material) => (
                <MaterialCard key={material.id} material={material} />
              ))
            ) : (
              <EmptyState
                title="没有匹配的材料"
                description="材料库为空时也可以正常使用，等需要时再补充。"
              />
            )}
          </div>
        )}

        {tab === "pending" && (
          <div className="stack">
            <p className="muted">
              未处理的留痕建议会一直留在这里，不会消失，也不需要马上处理。
            </p>
            <SuggestionList title="待补充材料" />
          </div>
        )}
      </div>
    </RequireProfile>
  );
}

const shiftMonth = (month: string, delta: number) => {
  const d = new Date(`${month}-01T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * 手绘情绪日历。
 *
 * - 白底 + 很淡的方格纸纹理，七列布局，格子之间没有明显边框，靠留白分隔；
 * - 每天只用**一个**主心情角色，情绪靠表情与形状区分，颜色只是辅助；
 * - 记了内容但没选心情时不猜情绪，只放一个中性的日记本图标；
 * - 不创建未来的日记；过去没记录的日子只是一个浅灰日期加空心小点，不像失败任务。
 */
function MoodCalendar({
  month,
  entries,
  events,
  suggestions,
  onPick,
  onShiftMonth,
  onBackToToday,
}: {
  month: string;
  entries: { id: string; date: string; mood?: Mood; content?: string }[];
  events: { id: string; status: string; occurredAt: string }[];
  suggestions: { entryId?: string; status: string }[];
  onPick: (date: string) => void;
  onShiftMonth: (delta: number) => void;
  onBackToToday: () => void;
}) {
  const navigate = useNavigate();
  const { start, end } = monthRange(`${month}-01`);
  const first = new Date(`${start}T12:00:00`);
  const total = Number(end.slice(8, 10));
  // 周一为一周的第一天，正确处理每月开头的空位
  const lead = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return `${month}-${day}`;
    }),
  ];
  const now = today();
  const [year, monthNumber] = month.split("-");

  // 有已确认事件或待补充材料的日子，只在角色下方放一个小标记
  const marked = useMemo(() => {
    const set = new Set<string>();
    for (const e of events)
      if (e.status === "confirmed") set.add(e.occurredAt.slice(0, 10));
    for (const s of suggestions) {
      if (s.status === "completed" || s.status === "not_needed") continue;
      const owner = entries.find((x) => x.id === s.entryId);
      if (owner) set.add(owner.date);
    }
    return set;
  }, [events, suggestions, entries]);

  const todayEntry = entries.find((e) => e.date === now);
  const todayRecorded = Boolean(todayEntry && hasRecord(todayEntry));

  return (
    <div className="stack" data-testid="mood-calendar">
      {/* 月份是主标题，年份是次要文字 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Companion size={38} simple />
          <div>
            <h2 className="text-lg leading-tight">
              {Number(monthNumber)} 月
            </h2>
            <p className="faint">{year} 年</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="tap-square"
            aria-label="上个月"
            onClick={() => onShiftMonth(-1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="tap-square"
            aria-label="下个月"
            disabled={month >= now.slice(0, 7)}
            onClick={() => onShiftMonth(1)}
          >
            <ChevronRight size={16} />
          </Button>
          <Button size="sm" onClick={onBackToToday}>
            回到今天
          </Button>
        </div>
      </div>

      {/* 方格纸只做背景，不影响日期与表情的可读性 */}
      <div
        className="paper-grid border-[1.3px] border-[var(--color-line)] p-2 sm:p-3"
        style={{ borderRadius: "14px 12px 15px 12px / 12px 15px 12px 14px" }}
        data-testid="calendar-paper"
      >
        <div
          className="mb-1 grid grid-cols-7 gap-1"
          data-testid="calendar-weekdays"
        >
          {WEEK_LABELS.map((w) => (
            <span key={w} className="faint text-center">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" data-testid="calendar-grid">
          {cells.map((date, i) => {
            if (!date) return <span key={`pad-${i}`} />;
            const raw = entries.find((e) => e.date === date);
            const entry = raw && hasRecord(raw) ? raw : undefined;
            const future = date > now;
            const isToday = date === now;
            const mood = entry?.mood;
            const label = mood
              ? MOODS[mood].label
              : entry
                ? "已记录，未选心情"
                : future
                  ? "未来日期"
                  : isToday
                    ? "今天，还没记录"
                    : "未记录";
            return (
              <button
                key={date}
                type="button"
                disabled={future}
                aria-label={`${date} ${label}`}
                onClick={() => onPick(date)}
                className={`mood-cell kbd-focus min-h-[4.25rem] ${
                  isToday ? "mood-cell-today" : ""
                }`}
              >
                <span
                  className={`text-[0.6875rem] leading-none ${
                    future
                      ? "text-[var(--color-faint)]"
                      : isToday
                        ? "font-medium text-[var(--color-ink)]"
                        : entry
                          ? "text-[var(--color-body)]"
                          : "text-[var(--color-faint)]"
                  }`}
                >
                  {isToday && !entry ? "今天" : Number(date.slice(8, 10))}
                </span>
                <span className="flex h-[26px] items-center justify-center">
                  {mood ? (
                    <MoodFace mood={mood} size={26} />
                  ) : entry ? (
                    <DiaryMark size={24} className="text-[var(--color-muted)]" />
                  ) : isToday ? (
                    <Plus size={20} className="text-[var(--color-line)]" />
                  ) : future ? null : (
                    <span className="h-[6px] w-[6px] rounded-full border-[1.2px] border-[var(--color-line)]" />
                  )}
                </span>
                <span className="flex h-[5px] items-center justify-center">
                  {marked.has(date) && (
                    <span className="h-[4px] w-[4px] rounded-full bg-[var(--color-ink)]" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 记录入口：淡黄底 + 深色描边的手绘铅笔按钮，放在日历下方 */}
      <div className="flex flex-col items-center gap-2 pt-1">
        {!todayRecorded && <p className="faint">今天还没写日记</p>}
        <Button
          variant="primary"
          className="w-full sm:w-auto"
          onClick={() => navigate("/today")}
        >
          <Pencil size={16} />
          {todayRecorded ? "继续记录今天" : "记录今天"}
        </Button>
      </div>
    </div>
  );
}
