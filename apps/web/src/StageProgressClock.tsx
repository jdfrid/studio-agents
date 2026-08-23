import { useMemo } from "react";
import { STAGE_ORDER, statusLabelHe } from "@studio/shared";
import { STAGE_LABELS } from "./StageOutputs.js";
import type { ProjectRunView, StageName } from "./types.js";

const R = 54;
const CX = 64;
const CY = 64;
const STROKE = 8;
const CIRC = 2 * Math.PI * R;

type StageTone = "pending" | "queued" | "running" | "awaiting" | "completed" | "failed";

function toneFor(status: string): StageTone {
  switch (status) {
    case "COMPLETED":
      return "completed";
    case "RUNNING":
      return "running";
    case "QUEUED":
      return "queued";
    case "AWAITING_APPROVAL":
      return "awaiting";
    case "FAILED":
      return "failed";
    default:
      return "pending";
  }
}

function stageStatus(run: ProjectRunView, stage: StageName): string {
  return run.stages.find((s) => s.stage === stage)?.status ?? "PENDING";
}

export function StageProgressClock({ run }: { run: ProjectRunView }) {
  const stages = useMemo(
    () =>
      STAGE_ORDER.map((stage, index) => {
        const status = stageStatus(run, stage);
        return { stage, index, status, tone: toneFor(status), label: STAGE_LABELS[stage] };
      }),
    [run]
  );

  const completed = stages.filter((s) => s.tone === "completed").length;
  const failed = stages.some((s) => s.tone === "failed");
  const active = stages.find((s) => s.tone === "running" || s.tone === "queued" || s.tone === "awaiting");
  const allDone = completed === stages.length;
  const progress = allDone ? 1 : completed / stages.length;
  const dash = CIRC * progress;
  const isBusy = Boolean(active) && !allDone && !failed;

  const handAngle = -90 + progress * 360;
  const activeAngle = active ? -90 + ((active.index + 0.5) / stages.length) * 360 : handAngle;

  const centerLabel = allDone
    ? "הושלם"
    : failed
      ? "שגיאה"
      : active
        ? active.label
        : "ממתין";

  const percent = Math.round(progress * 100);

  return (
    <aside
      className={`stage-progress-clock${isBusy ? " is-busy" : ""}${allDone ? " is-done" : ""}${failed ? " is-failed" : ""}`}
      aria-live="polite"
      aria-label={`התקדמות הריצה: ${percent}%, שלב נוכחי ${centerLabel}`}
    >
      <div className="stage-progress-clock-face">
        <svg viewBox="0 0 128 128" className="stage-progress-clock-svg" aria-hidden>
          <circle className="spc-track" cx={CX} cy={CY} r={R} />
          <circle
            className="spc-progress"
            cx={CX}
            cy={CY}
            r={R}
            strokeDasharray={`${dash} ${CIRC}`}
            transform={`rotate(-90 ${CX} ${CY})`}
          />
          {stages.map((s) => {
            const a0 = (-90 + (s.index / stages.length) * 360) * (Math.PI / 180);
            const a1 = (-90 + ((s.index + 1) / stages.length) * 360) * (Math.PI / 180);
            const mid = (a0 + a1) / 2;
            const tickR = R + 11;
            const x = CX + Math.cos(mid) * tickR;
            const y = CY + Math.sin(mid) * tickR;
            return (
              <g key={s.stage} className={`spc-tick spc-tick-${s.tone}`}>
                <circle cx={x} cy={y} r={s.tone === "running" ? 5.5 : 4} />
                {s.tone === "running" ? <circle className="spc-tick-pulse" cx={x} cy={y} r={9} /> : null}
              </g>
            );
          })}
          <line
            className="spc-hand"
            x1={CX}
            y1={CY}
            x2={CX + Math.cos((activeAngle * Math.PI) / 180) * (R - 14)}
            y2={CY + Math.sin((activeAngle * Math.PI) / 180) * (R - 14)}
          />
          <circle className="spc-hub" cx={CX} cy={CY} r={4} />
        </svg>
        <div className="stage-progress-clock-center">
          <strong>{percent}%</strong>
          <span>{centerLabel}</span>
        </div>
      </div>

      <ul className="stage-progress-clock-legend">
        {stages.map((s) => (
          <li key={s.stage} className={`spc-legend-${s.tone}`}>
            <span className="spc-legend-dot" aria-hidden />
            <span className="spc-legend-label">{s.label}</span>
            <span className="spc-legend-status">{statusLabelHe(s.status)}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
