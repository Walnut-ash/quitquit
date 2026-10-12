import type { Material, WorkEvent } from "../types";

export type RiskLevel = "insufficient" | "low" | "watch" | "high";

export interface RiskSignal {
  code: string;
  label: string;
  eventIds: string[];
  materialIds: string[];
  /** Ordinal attention only; not a probability, frequency, or validated score. */
  weight: number;
}

export interface RiskAssessment {
  level: RiskLevel;
  label: string;
  windowStart: string;
  windowEnd: string;
  assessedAt: string;
  ruleVersion: "signals-v1";
  signals: RiskSignal[];
  counterEvidence: RiskSignal[];
  missingInformation: string[];
  disclaimer: string;
}

interface Rule {
  code: string;
  label: string;
  weight: number;
  patterns: RegExp[];
  negatedTopic: RegExp;
}

const signalRules: Rule[] = [
  {
    code: "direct_notice",
    label: "Direct dismissal notice described",
    weight: 3,
    patterns: [
      /^(?:我|本人)?(?:已|已经)?(?:收到|接到|被送达)(?:公司|HR|人事)?的?(?:正式|书面|官方)?(?:解除(?:劳动合同|合同|劳动关系)?|辞退|裁员)的?(?:书面)?(?:通知书|通知|函)(?:了)?$/,
      /^(?:公司|HR|人事)(?:已|已经)?(?:向我|对我)?(?:发出|发来|送达)(?:正式|书面)?(?:解除(?:劳动合同|合同|劳动关系)?|辞退|裁员)(?:通知书|通知|函)$/,
      /^(?:正式|书面|官方)(?:解除(?:劳动合同|合同|劳动关系)?|辞退|裁员)(?:通知书|通知|函)$/,
      /^(?:HR|人事)(?:已|已经)?(?:正式|书面)?(?:通知|告知)(?:我|本人)?(?:被)?(?:辞退|裁员|解除(?:劳动合同|合同|劳动关系))(?:了)?$/,
      /^(?:公司)?(?:正式|书面|官方)(?:通知|告知)(?:我|本人)?(?:被)?(?:辞退|裁员|解除(?:劳动合同|合同|劳动关系))(?:了)?$/,
    ],
    negatedTopic: /解除|辞退|裁员/,
  },
  {
    code: "negotiation_pressure",
    label: "Resignation discussion or signing pressure",
    weight: 1,
    patterns: [
      /^(?:HR|人事)(?:已|已经)?(?:找我|约我|与我|和我)?(?:谈|讨论|协商)(?:离职|离职事宜)$/,
      /^(?:HR|人事|公司|主管)?(?:已|已经)?(?:要求|强制要求|限期要求)(?:我|本人)?(?:在)?(?:\d+天内|今天|明天|本周内)?签(?:署)?(?:离职|辞职)(?:协议|文件|申请|申请书)?$/,
      /^(?:我|本人)?(?:被)?(?:要求|限期)(?:在)?(?:\d+天内|今天|明天|本周内)?签(?:署)?(?:离职|辞职)(?:协议|文件|申请|申请书)?$/,
    ],
    negatedTopic: /离职|辞职|限期签/,
  },
  {
    code: "access_removal",
    label: "Access or meeting exclusion",
    weight: 1,
    patterns: [
      /^(?:我|本人)?(?:已|已经)?被?移出(?:了)?项目群(?:了)?$/,
      /^(?:公司|主管|管理员)(?:已|已经)?(?:把我|将我)移出项目群(?:了)?$/,
      /^(?:我的)?(?:账号|系统|项目)?权限(?:已|已经)?(?:被)?(?:关闭|取消|停用)(?:了)?$/,
      /^(?:公司|主管|管理员)(?:已|已经)?(?:关闭|取消|停用)(?:了)?(?:我的)?(?:账号|系统|项目)?权限$/,
      /^(?:我|本人)?(?:已|已经)?无法登录(?:公司)?(?:账号|系统|工作系统|工作账号)?(?:了)?$/,
      /^(?:项目)?会议(?:已)?不再邀请(?:我|本人)?(?:了)?$/,
      /^(?:我|本人)?不再被邀请参加(?:项目)?会议$/,
    ],
    negatedTopic: /移出|权限|无法登录|会议|邀请/,
  },
  {
    code: "role_withdrawal",
    label: "Responsibilities or assignments withdrawn",
    weight: 1,
    patterns: [
      /^(?:我的)?工作职责(?:已|已经)?(?:被)?(?:减少|削减|取消)(?:了)?$/,
      /^(?:我负责的|我的)?项目(?:已|已经|全部)?(?:被)?移交(?:给[\p{L}\d·]{1,12})?(?:了)?$/u,
      /^(?:公司|主管|上级)?(?:已|已经)?(?:给我)?不安排工作(?:了)?$/,
      /^(?:公司|主管|上级)(?:已|已经)?(?:不再|停止)(?:给我)?安排工作(?:了)?$/,
    ],
    negatedTopic: /工作职责|项目移交|安排工作/,
  },
  {
    code: "negative_performance",
    label: "Explicit performance plan or below-standard performance",
    weight: 1,
    patterns: [
      /^(?:我|本人)?(?:已|已经)?(?:收到|进入|被纳入|被要求参加|开始执行)?绩效改进计划(?:\(PIP\))?$/,
      /^(?:我的)?绩效(?:考核)?(?:被评为|被认定为)?不达标$/,
      /^(?:我|本人)?(?:被告知|被通知)绩效(?:考核)?不达标$/,
      /^(?:公司|HR|人事|主管)(?:通知|告知)我绩效(?:考核)?不达标$/,
    ],
    negatedTopic: /绩效改进计划|绩效.*不达标/,
  },
  {
    code: "organization_downsizing",
    label: "Department downsizing explicitly announced",
    weight: 1,
    patterns: [
      /^(?:公司|HR|人事)?(?:已|已经|正式)宣布(?:了)?部门缩编$/,
      /^部门(?:已|已经|正式)宣布(?:了)?缩编$/,
    ],
    negatedTopic: /缩编/,
  },
];

const counterRules: Rule[] = [
  {
    code: "role_restoration",
    label: "Role or access restoration described",
    weight: 0,
    patterns: [
      /^(?:我的)?(?:工作职责|项目职责|权限|账号权限)(?:已|已经)?(?:恢复|恢复正常)(?:了)?$/,
      /^(?:我|本人)?(?:已|已经)?恢复(?:了)?(?:工作职责|项目职责|权限)$/,
      /^(?:我|本人)?(?:已|已经)?重新加入(?:了)?项目群$/,
      /^(?:我|本人)?(?:已|已经)?(?:被)?移出(?:项目群)?后(?:已|已经)?重新加入(?:项目群)?$/,
    ],
    negatedTopic: /恢复|重新加入/,
  },
  {
    code: "normal_performance",
    label: "Normal or satisfactory performance explicitly recorded",
    weight: 0,
    patterns: [/^(?:我的)?绩效(?:考核)?(?:结果)?(?:是|为)?(?:正常|达标|合格)$/],
    negatedTopic: /绩效/,
  },
  {
    code: "new_project",
    label: "New project assigned",
    weight: 0,
    patterns: [
      /^(?:我|本人)?(?:已|已经)?(?:被分配|被安排|接到|收到)(?:了)?新项目(?:任务)?$/,
      /^(?:公司|主管|上级)(?:已|已经)?(?:给我|为我)(?:安排|分配)(?:了)?新项目$/,
    ],
    negatedTopic: /新项目/,
  },
  {
    code: "continued_responsibilities",
    label: "Continued responsibilities explicitly recorded",
    weight: 0,
    patterns: [
      /^(?:我|本人)?(?:继续|仍|仍然)负责(?:原有|原|当前|现有)?项目$/,
      /^(?:我|本人)?继续承担(?:原有)?工作职责$/,
      /^(?:我的)?工作职责(?:保持不变|未变|没有变化)$/,
    ],
    negatedTopic: /继续|负责|工作职责/,
  },
];

const labels: Record<RiskLevel, string> = {
  insufficient: "信息不足",
  low: "当前信号较少",
  watch: "需要关注",
  high: "建议优先核实",
};

const disclaimer =
  "Transparent deterministic layoff-risk attention signals only, not a probability, legal conclusion, or validated predictor. User confirmation is not independent verification. Saved or associated materials do not authenticate a notice or prove the original facts; a hash checks file integrity only. Counter-evidence is shown separately and never automatically cancels a formal dismissal signal. Mood, protected characteristics, company demographics, and salary are not inputs. No signals does not establish safety.";

function calendarDate(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

function eventDate(value: string): string | undefined {
  if (calendarDate(value)) return value;
  // An ISO timestamp may carry the recorded calendar date, but not an invalid day.
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    )
  )
    return undefined;
  return Number.isFinite(Date.parse(value))
    ? calendarDate(value.slice(0, 10))
    : undefined;
}

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").replace(/hr/gi, "HR");
}

function clauses(value: string): string[] {
  return value
    .split(/[。！？!?；;，,\n]+|但是|不过|随后|但/)
    .map((part) =>
      normalized(part).replace(/^(?:今天|今日|当天|昨天|昨日|本周)/, ""),
    )
    .filter(Boolean);
}

function matches(rule: Rule, clause: string): boolean {
  return rule.patterns.some((pattern) => pattern.test(clause));
}

function negates(rule: Rule, clause: string): boolean {
  // Negation must precede the fact. "无法登录" and "不安排工作" are affirmative facts.
  return (
    /^(?:(?:我|本人|公司|HR|人事|主管|部门|这|这份通知)(?:已|已经)?)?(?:并没有|并不是|并未|没有|不是|未曾|不曾|未|不)(?!再|安排|达标)/.test(
      clause,
    ) && rule.negatedTopic.test(clause)
  );
}

interface Fact {
  event: WorkEvent;
  date: string;
  signals: string[];
  counters: string[];
  fingerprint: string;
}

function readFact(event: WorkEvent, date: string): Fact {
  const title = clauses(event.title);
  const description = clauses(event.description);
  const recognized: string[] = [];
  const detect = (rule: Rule) => {
    const asserted = description.filter((clause) => matches(rule, clause));
    const blockedTitle =
      description.some((clause) => negates(rule, clause)) ||
      (rule.code === "access_removal" &&
        description.some((clause) => matches(counterRules[0], clause)));
    const matched = [
      ...asserted,
      ...(blockedTitle ? [] : title.filter((clause) => matches(rule, clause))),
    ];
    recognized.push(...matched);
    return matched.length > 0;
  };
  const signals = signalRules.filter(detect).map((rule) => rule.code);
  const counters = counterRules.filter(detect).map((rule) => rule.code);
  return {
    event,
    date,
    signals,
    counters,
    fingerprint: [...new Set(recognized)].sort().join("|"),
  };
}

function groupFacts(facts: Fact[]): Fact[][] {
  const groups: Fact[][] = [];
  const keysByGroup: Set<string>[] = [];
  for (const fact of facts) {
    const keys = new Set([`id:${fact.event.id}`]);
    if (fact.event.sourceId?.trim()) keys.add(`source:${fact.event.sourceId}`);
    if (normalized(fact.event.title))
      keys.add(`title:${fact.date}:${normalized(fact.event.title)}`);
    if (fact.fingerprint) keys.add(`facts:${fact.date}:${fact.fingerprint}`);
    const overlapping = keysByGroup.flatMap((existing, index) =>
      [...keys].some((key) => existing.has(key)) ? [index] : [],
    );
    const merged = [fact];
    for (const index of overlapping.reverse()) {
      merged.push(...groups[index]);
      for (const key of keysByGroup[index]) keys.add(key);
      groups.splice(index, 1);
      keysByGroup.splice(index, 1);
    }
    groups.push(merged);
    keysByGroup.push(keys);
  }
  return groups;
}

function saved(material: Material): boolean {
  return (
    material.status === "saved_externally" ||
    (material.status === "uploaded" && Boolean(material.fileId?.trim()))
  );
}

function associated(material: Material, group: Fact[]): boolean {
  return group.some(
    ({ event }) =>
      event.materialIds.includes(material.id) ||
      material.eventIds.includes(event.id),
  );
}

function materialIdentity(material: Material): string {
  // Hashes are only used to avoid counting identical copies, never to authenticate them.
  if (material.sha256?.trim()) return `hash:${material.sha256.toLowerCase()}`;
  if (material.fileId?.trim()) return `file:${material.fileId}`;
  if (material.externalLocationNote?.trim())
    return `external:${normalized(material.externalLocationNote)}`;
  return `id:${material.id}`;
}

export function assessRisk(
  events: WorkEvent[],
  materials: Material[],
  referenceDate: string,
): RiskAssessment {
  const windowEnd = calendarDate(referenceDate);
  if (!windowEnd)
    throw new RangeError(
      "referenceDate must be a real YYYY-MM-DD calendar date.",
    );
  const start = new Date(`${windowEnd}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const windowStart = start.toISOString().slice(0, 10);
  const confirmed = events.filter((event) => event.status === "confirmed");
  const facts = confirmed
    .flatMap((event) => {
      const date = eventDate(event.occurredAt);
      return date && date >= windowStart && date <= windowEnd
        ? [readFact(event, date)]
        : [];
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.event.id.localeCompare(b.event.id),
    );
  const groups = groupFacts(facts);
  const buildSignals = (
    rules: Rule[],
    field: "signals" | "counters",
  ): RiskSignal[] =>
    rules.flatMap((rule) => {
      const matching = groups.filter((group) =>
        group.some((fact) => fact[field].includes(rule.code)),
      );
      if (!matching.length) return [];
      return [
        {
          code: rule.code,
          label: rule.label,
          eventIds: [
            ...new Set(
              matching.flatMap((group) =>
                group
                  .filter((fact) => fact[field].includes(rule.code))
                  .map((fact) => fact.event.id),
              ),
            ),
          ].sort(),
          materialIds: [
            ...new Set(
              materials
                .filter(
                  (material) =>
                    saved(material) &&
                    matching.some((group) => associated(material, group)),
                )
                .map((material) => material.id),
            ),
          ].sort(),
          weight: rule.weight,
        },
      ];
    });
  const signals = buildSignals(signalRules, "signals");
  const counterEvidence = buildSignals(counterRules, "counters");
  const signalGroups = groups.filter((group) =>
    group.some((fact) => fact.signals.length),
  );
  // Copies of one source on several dates contribute only their earliest signal date.
  const distinctSignalDates = new Set(
    signalGroups.map(
      (group) =>
        group
          .filter((fact) => fact.signals.length)
          .map((fact) => fact.date)
          .sort()[0],
    ),
  );
  const supportingCopies = materials.filter(
    (material) =>
      saved(material) &&
      signalGroups.some((group) => associated(material, group)),
  );
  const supportingCount = new Set(supportingCopies.map(materialIdentity)).size;
  const positiveDates = new Set(
    groups.flatMap((group) => {
      const dated = group.filter((fact) =>
        fact.counters.some((code) =>
          [
            "continued_responsibilities",
            "normal_performance",
            "new_project",
          ].includes(code),
        ),
      );
      return dated.length ? [dated.map((fact) => fact.date).sort()[0]] : [];
    }),
  );
  // Match categories to independent fact groups; several labels on one copied
  // event cannot by themselves manufacture three independent categories.
  const matchedGroups = new Map<number, string>();
  const assignCategory = (code: string, visited: Set<number>): boolean => {
    for (let index = 0; index < signalGroups.length; index += 1) {
      if (
        visited.has(index) ||
        !signalGroups[index].some((fact) => fact.signals.includes(code))
      )
        continue;
      visited.add(index);
      const previous = matchedGroups.get(index);
      if (!previous || assignCategory(previous, visited)) {
        matchedGroups.set(index, code);
        return true;
      }
    }
    return false;
  };
  const independentCategoryCount = signals.filter((signal) =>
    assignCategory(signal.code, new Set()),
  ).length;
  const high =
    signals.some((signal) => signal.code === "direct_notice") ||
    (independentCategoryCount >= 3 &&
      distinctSignalDates.size >= 2 &&
      supportingCount >= 2);
  const level: RiskLevel = high
    ? "high"
    : signals.length
      ? "watch"
      : positiveDates.size >= 3
        ? "low"
        : "insufficient";

  const missing = new Set<string>([
    "Independent context: verify the actual dates, who communicated each change, the original message, and supporting sources; distinguish routine changes from employment decisions.",
  ]);
  if (!facts.length) {
    missing.add(
      "Add confirmed events with real occurrence dates within this 30-day window.",
    );
    missing.add(
      "Record the involved person and their role, the original message, and associated saved supporting materials.",
    );
  }
  for (const event of confirmed) {
    if (!eventDate(event.occurredAt))
      missing.add(
        `Event ${event.id}: supply a real occurrence date; this event was excluded.`,
      );
  }
  for (const { event } of facts) {
    if (!event.people.some((person) => person.trim()))
      missing.add(
        `Event ${event.id}: identify the involved person and their role.`,
      );
    if (!event.sourceQuote?.trim() && !event.sourceMessageIds?.length)
      missing.add(
        `Event ${event.id}: preserve the original message or its source reference.`,
      );
    if (
      !materials.some(
        (material) =>
          saved(material) &&
          (event.materialIds.includes(material.id) ||
            material.eventIds.includes(event.id)),
      )
    )
      missing.add(
        `Event ${event.id}: associate saved supporting materials; an unrelated or pending material is not support.`,
      );
  }
  if (signals.length && supportingCount < 2)
    missing.add(
      "Fewer than two distinct associated saved supporting materials; association still does not authenticate the facts.",
    );
  if (signals.length && distinctSignalDates.size < 2)
    missing.add(
      "Signals lack independent dated context across at least two distinct dates; duplicate sources are counted once.",
    );
  if (!signals.length && positiveDates.size < 3)
    missing.add(
      "Fewer than three distinct dates explicitly record continued responsibilities or normal performance; no signals alone is insufficient.",
    );
  for (const material of supportingCopies) {
    if (
      material.status === "saved_externally" &&
      !material.externalLocationNote?.trim()
    )
      missing.add(
        `Material ${material.id}: record where the externally saved original can be checked.`,
      );
  }
  return {
    level,
    label: labels[level],
    windowStart,
    windowEnd,
    // Deterministic as-of timestamp, not a notice issuance or verification timestamp.
    assessedAt: `${windowEnd}T00:00:00.000Z`,
    ruleVersion: "signals-v1",
    signals,
    counterEvidence,
    missingInformation: [...missing].sort(),
    disclaimer,
  };
}
