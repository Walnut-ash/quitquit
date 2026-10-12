import { describe, expect, it } from "vitest";
import { assessRisk, type RiskAssessment } from "../src/services/risk";
import type { Material, WorkEvent } from "../src/types";

const referenceDate = "2026-10-12";
const event = (patch: Partial<WorkEvent> = {}): WorkEvent => ({
  id: "e1",
  title: "Recorded event",
  occurredAt: "2026-10-10",
  people: ["Project lead"],
  description: "",
  status: "confirmed",
  attention: "normal",
  sourceType: "manual",
  sourceQuote: "Original user-provided message",
  materialIds: [],
  updates: [],
  createdAt: "2026-10-10T12:00:00.000Z",
  updatedAt: "2026-10-10T12:00:00.000Z",
  ...patch,
});
const material = (patch: Partial<Material> = {}): Material => ({
  id: "m1",
  name: "User-saved project message",
  type: "project",
  status: "saved_externally",
  externalLocationNote: "Local user archive / message 1",
  isCurrent: true,
  eventIds: [],
  extractionStatus: "none",
  createdAt: "2026-10-10T12:00:00.000Z",
  updatedAt: "2026-10-10T12:00:00.000Z",
  ...patch,
});
const codes = (assessment: RiskAssessment) =>
  assessment.signals.map((signal) => signal.code);
const multiCategoryEvents = () => [
  event({
    id: "e1",
    title: "Access change",
    description: "被移出项目群",
    occurredAt: "2026-10-09",
  }),
  event({
    id: "e2",
    title: "Role change",
    description: "工作职责减少",
    occurredAt: "2026-10-10",
  }),
  event({
    id: "e3",
    title: "HR discussion",
    description: "HR谈离职",
    occurredAt: "2026-10-11",
  }),
];
const support = () => [
  material({ id: "m1", eventIds: ["e1"] }),
  material({
    id: "m2",
    eventIds: ["e2"],
    externalLocationNote: "Local user archive / message 2",
  }),
];

// @ts-expect-error Mood is not an argument of the public assessment API.
const moodCannotBeAnInput: Parameters<typeof assessRisk>[3] = "anxious";
void moodCannotBeAnInput;

describe("transparent deterministic layoff attention signals", () => {
  it("returns the required shape and insufficient information for no events", () => {
    const result = assessRisk([], [], referenceDate);
    expect(result).toEqual({
      level: "insufficient",
      label: "信息不足",
      windowStart: "2026-09-13",
      windowEnd: referenceDate,
      assessedAt: "2026-10-12T00:00:00.000Z",
      ruleVersion: "signals-v1",
      signals: [],
      counterEvidence: [],
      missingInformation: expect.any(Array),
      disclaimer: expect.any(String),
    });
    expect(result.missingInformation.join(" ")).toMatch(
      /date.*person.*original message.*supporting/i,
    );
    expect(result.disclaimer).toMatch(
      /not a probability, legal conclusion, or validated predictor/,
    );
  });

  it("does not use pure mood, salary, or personal characteristics as facts", () => {
    const result = assessRisk(
      [
        event({
          description:
            "I feel anxious and sad. My salary changed. I am pregnant, age 50, and disabled.",
          attention: "priority",
        }),
      ],
      [],
      referenceDate,
    );
    expect(result.level).toBe("insufficient");
    expect(result.signals).toEqual([]);
    expect(result.counterEvidence).toEqual([]);
  });

  it("excludes drafts and dismissed events even with formal notice text", () => {
    const result = assessRisk(
      [
        event({
          id: "draft",
          status: "draft",
          description: "收到书面解除通知",
        }),
        event({
          id: "dismissed",
          status: "dismissed",
          description: "HR通知我辞退",
        }),
      ],
      support(),
      referenceDate,
    );
    expect(result.level).toBe("insufficient");
    expect(result.signals).toEqual([]);
  });

  it("excludes future events", () => {
    expect(
      assessRisk(
        [event({ occurredAt: "2026-10-13", description: "收到书面解除通知" })],
        [],
        referenceDate,
      ).signals,
    ).toEqual([]);
  });

  it.each([
    "",
    "unknown",
    "2026-02-30",
    "2026-13-10",
    "2026-10-00",
    "2026-10-10garbage",
    "2026-02-30T12:00:00Z",
    "2026-10-10T25:00:00Z",
  ])("excludes a non-real occurrence date: %s", (occurredAt) => {
    const result = assessRisk(
      [event({ occurredAt, description: "收到书面解除通知" })],
      [],
      referenceDate,
    );
    expect(result.level).toBe("insufficient");
    expect(result.signals).toEqual([]);
    expect(result.missingInformation.join(" ")).toContain(
      "real occurrence date",
    );
  });

  it("includes both 30-day boundaries and excludes reference minus 30 days", () => {
    const result = assessRisk(
      [
        event({
          id: "start",
          occurredAt: "2026-09-13",
          title: "Start",
          description: "被移出项目群",
        }),
        event({
          id: "end",
          occurredAt: "2026-10-12",
          title: "End",
          description: "工作职责减少",
        }),
        event({
          id: "old",
          occurredAt: "2026-09-12",
          title: "Old",
          description: "收到书面解除通知",
        }),
      ],
      [],
      referenceDate,
    );
    expect(result.windowStart).toBe("2026-09-13");
    expect(codes(result)).toEqual(["access_removal", "role_withdrawal"]);
    expect(result.signals.flatMap((signal) => signal.eventIds)).toEqual([
      "start",
      "end",
    ]);
  });

  it("uses recorded calendar days for valid ISO occurrence timestamps", () => {
    const result = assessRisk(
      [
        event({
          occurredAt: "2026-10-12T23:30:00+08:00",
          description: "被移出项目群",
        }),
      ],
      [],
      referenceDate,
    );
    expect(result.level).toBe("watch");
  });

  it("handles leap-year and year-crossing windows deterministically", () => {
    expect(assessRisk([], [], "2024-03-01").windowStart).toBe("2024-02-01");
    expect(assessRisk([], [], "2026-01-01").windowStart).toBe("2025-12-03");
    expect(() => assessRisk([], [], "2026-02-30")).toThrow(RangeError);
  });

  it.each([
    "没有被移出项目群",
    "我没有被移出项目群",
    "不是解除",
    "未收到解除通知",
    "没有收到书面解除通知",
    "并未收到解除劳动合同通知",
    "未进入绩效改进计划",
    "没有要求签离职协议",
    "没有宣布部门缩编",
    "不是绩效不达标",
    "没有重新加入项目群",
    "未被分配新项目",
  ])("does not match a negated statement: %s", (description) => {
    const result = assessRisk([event({ description })], [], referenceDate);
    expect(result.signals).toEqual([]);
    expect(result.counterEvidence).toEqual([]);
  });

  it("uses a negated description to prevent a misleading positive title", () => {
    const result = assessRisk(
      [
        event({
          title: "收到书面解除通知",
          description: "不是解除，未收到解除通知",
        }),
      ],
      [],
      referenceDate,
    );
    expect(result.signals).toEqual([]);
    const access = assessRisk(
      [event({ title: "被移出项目群", description: "我没有被移出项目群" })],
      [],
      referenceDate,
    );
    expect(access.signals).toEqual([]);
  });

  it.each([
    "如果被移出项目群就记录",
    "担心收到解除通知",
    "HR可能会谈离职",
    "听说可能宣布部门缩编",
    "讨论如何签离职协议",
    "别人被移出项目群",
    "阅读绩效改进计划模板",
    "询问无法登录怎么办",
    "绩效正常，公司规模很大",
    "HR介绍裁员通知模板",
  ])(
    "rejects hypothetical, unrelated, or unanchored descriptions: %s",
    (description) => {
      expect(
        assessRisk([event({ description })], [], referenceDate).signals,
      ).toEqual([]);
    },
  );

  it("a single exclusion is watch, not high, even with many materials", () => {
    const result = assessRisk(
      [event({ description: "被移出项目群" })],
      [
        ...support(),
        material({
          id: "m3",
          eventIds: ["e1"],
          externalLocationNote: "Third message",
        }),
      ],
      referenceDate,
    );
    expect(result.level).toBe("watch");
    expect(result.label).toBe("需要关注");
    expect(result.signals).toHaveLength(1);
  });

  it("multiple access problems remain one category", () => {
    const result = assessRisk(
      [
        event({
          description: "被移出项目群。权限关闭。无法登录。会议不再邀请我。",
        }),
      ],
      support(),
      referenceDate,
    );
    expect(codes(result)).toEqual(["access_removal"]);
    expect(result.level).toBe("watch");
    expect(result.signals[0].weight).toBe(1);
  });

  it.each([
    "HR谈离职",
    "HR要求我签离职协议",
    "要求签离职",
    "限期签离职",
    "限期3天内签离职协议",
  ])("recognizes explicit negotiation pressure: %s", (description) => {
    expect(
      codes(assessRisk([event({ description })], [], referenceDate)),
    ).toEqual(["negotiation_pressure"]);
  });

  it.each([
    "工作职责减少",
    "项目移交",
    "我的项目已经移交给同事",
    "不安排工作",
    "主管不再给我安排工作",
  ])("recognizes explicit role withdrawal: %s", (description) => {
    expect(
      codes(assessRisk([event({ description })], [], referenceDate)),
    ).toEqual(["role_withdrawal"]);
  });

  it.each(["收到绩效改进计划", "进入绩效改进计划（PIP）", "绩效不达标"])(
    "recognizes only explicit negative performance facts: %s",
    (description) => {
      expect(
        codes(assessRisk([event({ description })], [], referenceDate)),
      ).toEqual(["negative_performance"]);
    },
  );

  it("normal performance and bare PIP mentions do not cause a negative performance signal", () => {
    expect(
      assessRisk([event({ description: "绩效正常。PIP。" })], [], referenceDate)
        .signals,
    ).toEqual([]);
  });

  it("requires explicit announced department downsizing", () => {
    expect(
      codes(
        assessRisk(
          [event({ description: "公司已宣布部门缩编" })],
          [],
          referenceDate,
        ),
      ),
    ).toEqual(["organization_downsizing"]);
    expect(
      assessRisk([event({ description: "部门可能缩编" })], [], referenceDate)
        .signals,
    ).toEqual([]);
  });

  it.each([
    "收到书面解除通知",
    "收到公司正式解除劳动合同通知书",
    "HR通知我辞退",
    "官方裁员通知",
    "公司书面通知我解除劳动合同",
  ])(
    "prioritizes an explicit direct dismissal notice without asserting validity: %s",
    (description) => {
      const result = assessRisk([event({ description })], [], referenceDate);
      expect(result.level).toBe("high");
      expect(result.label).toBe("建议优先核实");
      expect(codes(result)).toEqual(["direct_notice"]);
      expect(result.signals[0]).toMatchObject({
        eventIds: ["e1"],
        materialIds: [],
        weight: 3,
      });
      expect(result.missingInformation.join(" ")).toContain(
        "saved supporting materials",
      );
    },
  );

  it("does not infer a dismissal signal from material contents or hashes", () => {
    const result = assessRisk(
      [event({ description: "Routine meeting" })],
      [
        material({
          eventIds: ["e1"],
          type: "notice",
          name: "Official dismissal notice",
          sha256: "a".repeat(64),
          confirmedExtraction: "收到书面解除通知",
          extractionStatus: "confirmed",
        }),
      ],
      referenceDate,
    );
    expect(result.signals).toEqual([]);
    expect(result.level).toBe("insufficient");
  });

  it("requires linked materials, not unrelated saved evidence", () => {
    const result = assessRisk(
      multiCategoryEvents(),
      [
        material(),
        material({ id: "m2", externalLocationNote: "Other archive" }),
      ],
      referenceDate,
    );
    expect(result.level).toBe("watch");
    expect(
      result.signals.every((signal) => signal.materialIds.length === 0),
    ).toBe(true);
  });

  it("combines three different categories, multiple dates, and two associated saved materials", () => {
    const result = assessRisk(multiCategoryEvents(), support(), referenceDate);
    expect(result.level).toBe("high");
    expect(codes(result)).toEqual([
      "negotiation_pressure",
      "access_removal",
      "role_withdrawal",
    ]);
    expect(
      result.signals.find((signal) => signal.code === "access_removal")
        ?.materialIds,
    ).toEqual(["m1"]);
    expect(result.disclaimer).toContain("do not authenticate");
    expect(result.disclaimer).toContain("integrity only");
  });

  it("allows three independent categories across exactly two dates with saved support", () => {
    const entries = multiCategoryEvents();
    entries[2].occurredAt = entries[1].occurredAt;
    expect(assessRisk(entries, support(), referenceDate).level).toBe("high");
  });

  it("multiple categories on duplicate source/title/facts do not manufacture independent signals", () => {
    for (const kind of ["source", "title", "facts"]) {
      const entries = [
        event({
          id: "e1",
          title: "Combined",
          description: "被移出项目群。工作职责减少。HR谈离职。",
          sourceId: kind === "source" ? "same-source" : undefined,
        }),
        event({
          id: "e2",
          title: kind === "title" ? "Combined" : "Copy",
          description: "被移出项目群。工作职责减少。HR谈离职。",
          sourceId: kind === "source" ? "same-source" : undefined,
        }),
        event({
          id: "e3",
          title: "Another access fact",
          occurredAt: "2026-10-11",
          description: "权限关闭",
        }),
      ];
      const result = assessRisk(entries, support(), referenceDate);
      expect(result.signals).toHaveLength(3);
      expect(result.level).toBe("watch");
    }
  });

  it("accepts associations in either direction and uploaded files with file IDs", () => {
    const events = multiCategoryEvents();
    events[0].materialIds = ["m1"];
    const result = assessRisk(
      events,
      [
        material({
          id: "m1",
          status: "uploaded",
          fileId: "file1",
          externalLocationNote: undefined,
        }),
        material({
          id: "m2",
          eventIds: ["e2"],
          externalLocationNote: "Other original",
        }),
      ],
      referenceDate,
    );
    expect(result.level).toBe("high");
    expect(
      result.signals.find((signal) => signal.code === "access_removal")
        ?.materialIds,
    ).toEqual(["m1"]);
  });

  it("does not count pending materials or uploaded records without files", () => {
    for (const second of [
      material({ id: "m2", eventIds: ["e2"], status: "pending" }),
      material({
        id: "m2",
        eventIds: ["e2"],
        status: "uploaded",
        fileId: undefined,
      }),
    ]) {
      expect(
        assessRisk(multiCategoryEvents(), [support()[0], second], referenceDate)
          .level,
      ).toBe("watch");
    }
  });

  it("two categories never satisfy the multi-category high gate", () => {
    const result = assessRisk(
      multiCategoryEvents().slice(0, 2),
      support(),
      referenceDate,
    );
    expect(result.level).toBe("watch");
  });

  it("three categories on one date do not satisfy the distinct-date gate", () => {
    const events = multiCategoryEvents().map((entry) => ({
      ...entry,
      occurredAt: "2026-10-10",
    }));
    expect(assessRisk(events, support(), referenceDate).level).toBe("watch");
  });

  it("does not gain frequency or high attention from repeated copies of the same fact", () => {
    const events = Array.from({ length: 15 }, (_, index) =>
      event({
        id: `e${index}`,
        title: "Access change",
        description: "被移出项目群",
        sourceId: "same-source",
        occurredAt: index % 2 ? "2026-10-09" : "2026-10-10",
      }),
    );
    const result = assessRisk(events, support(), referenceDate);
    expect(result.level).toBe("watch");
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].weight).toBe(1);
  });

  it("one source copied across dates cannot manufacture independent context", () => {
    const events = multiCategoryEvents().map((entry) => ({
      ...entry,
      sourceId: "same-source",
    }));
    expect(assessRisk(events, support(), referenceDate).level).toBe("watch");
  });

  it("same-day titles or event facts are deduplicated without creating repeated positive dates", () => {
    const entries = Array.from({ length: 5 }, (_, index) =>
      event({
        id: `positive-${index}`,
        title: `Copied positive ${index}`,
        description: "绩效正常",
        occurredAt: "2026-10-10",
      }),
    );
    expect(assessRisk(entries, [], referenceDate).level).toBe("insufficient");
    expect(
      assessRisk(
        entries.map((entry, index) => ({
          ...entry,
          sourceId: "same-positive-source",
          occurredAt: `2026-10-${String(index + 6).padStart(2, "0")}`,
        })),
        [],
        referenceDate,
      ).level,
    ).toBe("insufficient");
  });

  it.each(["file", "hash", "external"])(
    "does not count duplicate saved material identities: %s",
    (identity) => {
      const common =
        identity === "file"
          ? {
              status: "uploaded" as const,
              fileId: "same-file",
              externalLocationNote: undefined,
            }
          : identity === "hash"
            ? { sha256: "a".repeat(64) }
            : { externalLocationNote: "Same original message" };
      const materials = support().map((entry) => ({ ...entry, ...common }));
      expect(
        assessRisk(multiCategoryEvents(), materials, referenceDate).level,
      ).toBe("watch");
    },
  );

  it("preserves a restoration as counter-evidence without treating the reversal as an exclusion", () => {
    const result = assessRisk(
      [event({ title: "被移出项目群", description: "移出后重新加入" })],
      [],
      referenceDate,
    );
    expect(result.signals).toEqual([]);
    expect(result.counterEvidence.map((signal) => signal.code)).toEqual([
      "role_restoration",
    ]);
    expect(result.level).toBe("insufficient");
  });

  it("keeps an already-recorded removal followed by rejoining as counter-evidence", () => {
    const result = assessRisk(
      [event({ description: "我已经被移出项目群后重新加入项目群" })],
      [],
      referenceDate,
    );
    expect(result.signals).toEqual([]);
    expect(result.counterEvidence.map((signal) => signal.code)).toEqual([
      "role_restoration",
    ]);
  });

  it("retains separately asserted access loss and subsequent restoration", () => {
    const result = assessRisk(
      [event({ description: "被移出项目群。随后重新加入项目群。" })],
      [],
      referenceDate,
    );
    expect(codes(result)).toEqual(["access_removal"]);
    expect(result.counterEvidence.map((signal) => signal.code)).toEqual([
      "role_restoration",
    ]);
    expect(result.level).toBe("watch");
  });

  it("counter-evidence never automatically cancels a serious direct notice", () => {
    const result = assessRisk(
      [
        event({
          description:
            "收到书面解除通知。权限恢复。绩效正常。主管给我安排新项目。",
        }),
      ],
      [],
      referenceDate,
    );
    expect(result.level).toBe("high");
    expect(codes(result)).toEqual(["direct_notice"]);
    expect(result.counterEvidence.map((signal) => signal.code)).toEqual([
      "role_restoration",
      "normal_performance",
      "new_project",
    ]);
    expect(result.disclaimer).toContain("never automatically cancels");
  });

  it("requires at least three different positive dates for low attention with no signals", () => {
    const entries = [
      event({
        id: "p1",
        title: "Continued work",
        occurredAt: "2026-10-07",
        description: "继续负责原项目",
      }),
      event({
        id: "p2",
        title: "Performance",
        occurredAt: "2026-10-09",
        description: "绩效正常",
      }),
      event({
        id: "p3",
        title: "New work",
        occurredAt: "2026-10-11",
        description: "主管给我安排新项目",
      }),
    ];
    expect(assessRisk(entries.slice(0, 2), [], referenceDate).level).toBe(
      "insufficient",
    );
    const result = assessRisk(entries, [], referenceDate);
    expect(result.level).toBe("low");
    expect(result.label).toBe("当前信号较少");
    expect(result.signals).toEqual([]);
  });

  it("ordinary confirmed entries alone do not qualify as low attention", () => {
    const entries = Array.from({ length: 4 }, (_, index) =>
      event({
        id: `ordinary-${index}`,
        occurredAt: `2026-10-0${index + 5}`,
        description: "Attended a meeting",
      }),
    );
    expect(assessRisk(entries, [], referenceDate).level).toBe("insufficient");
  });

  it("lists missing person, original message, material support, and independent context", () => {
    const result = assessRisk(
      [event({ people: [], sourceQuote: undefined, description: "权限关闭" })],
      [],
      referenceDate,
    );
    const gaps = result.missingInformation.join(" ");
    expect(gaps).toContain("involved person");
    expect(gaps).toContain("original message");
    expect(gaps).toContain("saved supporting materials");
    expect(gaps).toContain("Independent context");
  });

  it("does not change when sensitive characteristics, demographics, salary, or mood metadata change", () => {
    const entries = multiCategoryEvents();
    const baseline = assessRisk(entries, support(), referenceDate);
    const decorated = entries.map((entry) => ({
      ...entry,
      age: 60,
      gender: "female",
      disability: true,
      pregnancy: true,
      race: "arbitrary",
      companyHeadcount: 100000,
      salary: 1,
      mood: "sad",
      description: `${entry.description}。Age, gender, disability, pregnancy, company size, salary, and anxiety changed.`,
    }));
    expect(assessRisk(decorated, support(), referenceDate)).toEqual(baseline);
  });

  it("ignores appended updates unless represented as a dated confirmed fact", () => {
    const result = assessRisk(
      [
        event({
          description: "Routine meeting",
          updates: [
            {
              id: "u1",
              content: "收到书面解除通知",
              createdAt: "2026-10-13T12:00:00Z",
            },
          ],
        }),
      ],
      [],
      referenceDate,
    );
    expect(result.signals).toEqual([]);
  });

  it("is deterministic, order-independent, and does not mutate inputs", () => {
    const entries = multiCategoryEvents();
    const materials = support();
    const snapshot = JSON.stringify({ entries, materials });
    const first = assessRisk(entries, materials, referenceDate);
    expect(assessRisk(entries, materials, referenceDate)).toEqual(first);
    expect(
      assessRisk(
        [...entries].reverse(),
        [...materials].reverse(),
        referenceDate,
      ),
    ).toEqual(first);
    expect(JSON.stringify({ entries, materials })).toBe(snapshot);
    expect(JSON.stringify(first)).not.toMatch(/\d\s*%/);
  });
});
