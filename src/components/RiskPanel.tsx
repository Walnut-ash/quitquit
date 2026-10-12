import { useId, useMemo } from "react";
import { Link } from "react-router-dom";
import { today } from "../constants";
import { downloadBlob } from "../services/files";
import { assessRisk, type RiskLevel, type RiskSignal } from "../services/risk";
import { useAppStore } from "../store/useAppStore";
import { Badge, Button, type Tone } from "./ui";

const tones: Record<RiskLevel, Tone> = {
  insufficient: "neutral",
  low: "neutral",
  watch: "warning",
  high: "warning",
};

export function RiskPanel() {
  const titleId = useId();
  const events = useAppStore((state) => state.events);
  const materials = useAppStore((state) => state.materials);
  const referenceDate = today();
  const localAssessment = useMemo(
    () => assessRisk(events, materials, referenceDate),
    [events, materials, referenceDate],
  );
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const materialsById = new Map(
    materials.map((material) => [material.id, material]),
  );

  const sources = (signal: RiskSignal) => (
    <ul className="stack-sm mt-2 text-sm">
      {signal.eventIds.map((id) => {
        const event = eventsById.get(id);
        const count = signal.materialIds.filter((materialId) => {
          const material = materialsById.get(materialId);
          return (
            event?.materialIds.includes(materialId) ||
            material?.eventIds.includes(id)
          );
        }).length;
        return (
          <li
            key={id}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
          >
            <Link
              to={`/events/${encodeURIComponent(id)}`}
              className="kbd-focus min-w-0 break-words text-[var(--color-ink)] underline underline-offset-4"
            >
              {event?.title || id}
            </Link>
            <span className="muted">
              <time dateTime={event?.occurredAt.slice(0, 10)}>
                {event?.occurredAt.slice(0, 10)}
              </time>
              {" · "}
              {count} associated saved {count === 1 ? "material" : "materials"}
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section
      className="panel stack"
      aria-labelledby={titleId}
      data-testid="risk-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={titleId}>{"裁员风险信号（规则初筛）"}</h2>
        <span role="status" aria-live="polite">
          <Badge tone={tones[localAssessment.level]}>
            {localAssessment.label}
          </Badge>
        </span>
      </div>
      <p className="small muted">
        Attention signals, not a probability or a prediction. Generated
        dynamically from currently confirmed facts in the 30-day window; changes
        to facts or materials update this local view. It is not automatically
        saved.
      </p>
      <p className="small muted">
        <time dateTime={localAssessment.windowStart}>
          {localAssessment.windowStart}
        </time>
        {" to "}
        <time dateTime={localAssessment.windowEnd}>
          {localAssessment.windowEnd}
        </time>
        {" (inclusive). As of "}
        <time dateTime={localAssessment.assessedAt}>
          {localAssessment.windowEnd}
        </time>
        .
      </p>

      {localAssessment.signals.length ? (
        <ul className="stack-sm" aria-label="Attention signals">
          {localAssessment.signals.map((signal) => (
            <li key={signal.code} className="panel-flat stack-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">{signal.label}</Badge>
                <span className="small muted">
                  Attention weight {signal.weight}
                </span>
              </div>
              {sources(signal)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          No explicit signal matched the current rules. This is not reassurance
          that dismissal will not occur; missing or unmatched facts remain
          unknown.
        </p>
      )}

      {localAssessment.counterEvidence.length > 0 && (
        <div className="stack-sm">
          <h3>Counter-evidence kept separately</h3>
          <p className="small muted">
            Restoration, continued responsibilities, normal performance, or a
            new project does not automatically cancel a formal dismissal signal.
          </p>
          <ul className="stack-sm">
            {localAssessment.counterEvidence.map((signal) => (
              <li key={signal.code} className="panel-flat">
                <Badge tone="neutral">{signal.label}</Badge>
                {sources(signal)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="panel-flat">
        <summary className="kbd-focus cursor-pointer font-medium">
          Methodology and information gaps · {localAssessment.ruleVersion}
        </summary>
        <div className="stack-sm mt-3 text-sm text-[var(--color-body)]">
          <p>
            Only confirmed events with real dates from the reference day minus
            29 days through the reference day are eligible. Future, draft, and
            dismissed events are excluded. Duplicate IDs, sources, same-day
            titles, and same-day recognized facts are grouped, not counted as
            repeated occurrences. Weights express attention only and are not
            summed.
          </p>
          <p>
            These conservative anchored rules match explicit dismissal notices,
            HR resignation discussions or signing pressure, access exclusion,
            withdrawn responsibilities, explicit performance improvement plans
            or below-standard performance, and announced department downsizing.
            Negations and restoration descriptions are considered; paraphrases,
            hypothetical statements, and vague descriptions may not match. Mood,
            personal characteristics, company demographics, and salary are not
            used.
          </p>
          <p>
            Priority verification requires a direct dismissal notice described
            in a confirmed event, or at least three different categories
            supported by three independent fact groups across at least two
            distinct dates with at least two distinct associated saved
            materials. A single exclusion only calls for attention. With no
            signals, at least three distinct dates explicitly recording
            continued responsibilities, a new project, or normal performance are
            required for the fewer-current-signals label; otherwise information
            is insufficient. Low attention does not establish safety.
          </p>
          <p>
            Materials count only when associated with the event and recorded as
            uploaded with a file ID or saved externally. An unrelated file does
            not support a signal. Duplicate file IDs, hashes, or external
            locations are not extra support. Association and saved status are
            not authentication; a hash checks integrity only.
          </p>
          <p>
            The assessment timestamp is the deterministic reference-day
            midnight, not a verification time. Export time is recorded
            separately only if you choose to download a snapshot.
          </p>
          <h3>Information to clarify</h3>
          <ul className="list-disc space-y-1 pl-5">
            {localAssessment.missingInformation.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      </details>
      <p className="small muted">{localAssessment.disclaimer}</p>
      <div className="button-row no-print">
        <Button
          type="button"
          size="sm"
          onClick={() =>
            downloadBlob(
              new Blob(
                [
                  JSON.stringify(
                    {
                      kind: "user_generated_rule_screening",
                      generatedAt: new Date().toISOString(),
                      assessment: localAssessment,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
              `layoff-signals-${referenceDate}.json`,
            )
          }
        >
          Download user-generated JSON snapshot
        </Button>
      </div>
    </section>
  );
}

export default RiskPanel;
