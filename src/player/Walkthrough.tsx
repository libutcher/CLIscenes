import { useEffect, useMemo, useRef, useState } from "react";
import { visibleOverlays, type GateState, type OrchestratorState } from "../core/orchestrator.ts";
import type { OverlayAction } from "../core/schema.ts";
import { commandForStep, stepProgress } from "../core/timeline.ts";
import type { CompiledDemo } from "../core/types.ts";
import { OverlayView } from "./overlays/registry.tsx";
import { useWalkthrough } from "./useWalkthrough.ts";
import { copyText } from "./clipboard.ts";
import { themeVariables } from "../core/theme.ts";
import { usePrefersDark } from "./usePrefersDark.ts";

interface WalkthroughProps {
  demo: CompiledDemo;
  /** URL of the folder containing demo.json, ending in "/". */
  baseUrl: string;
}

export function Walkthrough({ demo, baseUrl }: WalkthroughProps) {
  const { terminalRef, orchestrator, state } = useWalkthrough(demo, baseUrl);
  const rootRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const step = demo.steps[state.stepIndex]!;
  const overlays = visibleOverlays(demo, state);
  const waiting = state.status === "awaiting-action";
  const dark = usePrefersDark();
  const themeStyle = useMemo(() => themeVariables(demo.theme, dark ? "dark" : "light") as React.CSSProperties, [demo.theme, dark]);

  // When a gated step's overlay appears, move focus to its primary action, but
  // only if the reader is already using the walkthrough. This avoids focus
  // (and scroll) jumping around a documentation page the reader is scrolling past.
  const gateOpen = Boolean(step.gate) && overlays.length > 0;
  useEffect(() => {
    if (!gateOpen) return;
    const root = rootRef.current;
    if (!root || !root.contains(document.activeElement)) return;
    root.querySelector<HTMLElement>("[data-primary-action]")?.focus({ preventScroll: true });
  }, [gateOpen, state.stepIndex]);

  const onAction = (action: OverlayAction) => {
    // The clicked button is about to disappear; keep focus somewhere useful.
    playRef.current?.focus({ preventScroll: true });
    void orchestrator?.completeAction(step.id, action.next);
  };

  return (
    <div
      ref={rootRef}
      className={`cs-walkthrough cs-layout-${demo.layout}`}
      data-status={state.status}
      style={themeStyle}
    >
      <div className="cs-header">
        <h2 className="cs-title">{demo.title}</h2>
        {demo.description && <p className="cs-description">{demo.description}</p>}
        {demo.prerequisites && (
          <div className="cs-prereqs">
            <span className="cs-prereqs__label">Before you start:</span>
            <ul>
              {demo.prerequisites.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="cs-stage">
        <div className="cs-terminal-pane">
          <div
            ref={terminalRef}
            className="cs-terminal"
            role="region"
            aria-label="Terminal (text can be selected and copied)"
            style={{ "--cs-terminal-cols": demo.terminal.cols } as React.CSSProperties}
          />
        </div>
        <ExternalPane
          demo={demo}
          state={state}
          overlays={overlays}
          baseUrl={baseUrl}
          waiting={waiting}
          onAction={onAction}
        />
      </div>

      <Controls demo={demo} state={state} playRef={playRef} orchestrator={orchestrator} />
      <StepList demo={demo} state={state} onSelect={(i) => void orchestrator?.goToStep(i)} />
      <Announcer demo={demo} state={state} />
    </div>
  );
}

function ExternalPane({
  demo,
  state,
  overlays,
  baseUrl,
  waiting,
  onAction,
}: {
  demo: CompiledDemo;
  state: OrchestratorState;
  overlays: ReturnType<typeof visibleOverlays>;
  baseUrl: string;
  waiting: boolean;
  onAction: (action: OverlayAction) => void;
}) {
  // In overlay layout, the pane only exists while there is something to show.
  if (demo.layout === "overlay" && overlays.length === 0) return null;
  return (
    <div className="cs-external" role="region" aria-label="Outside the terminal">
      {overlays.length === 0 ? (
        <p className="cs-placeholder">
          {state.status === "idle"
            ? "Select Play to start. Apps, dialogs, and browser windows appear here."
            : "Nothing is happening outside the terminal in this step."}
        </p>
      ) : (
        overlays.map((overlay, i) => (
          <OverlayView key={`${state.stepIndex}-${i}`} overlay={overlay} baseUrl={baseUrl} waiting={waiting} onAction={onAction} />
        ))
      )}
    </div>
  );
}

function Controls({
  demo,
  state,
  playRef,
  orchestrator,
}: {
  demo: CompiledDemo;
  state: OrchestratorState;
  playRef: React.RefObject<HTMLButtonElement | null>;
  orchestrator: ReturnType<typeof useWalkthrough>["orchestrator"];
}) {
  const [copied, setCopied] = useState(false);
  const command = commandForStep(demo, state.stepIndex);
  const total = demo.steps.length;
  const step = demo.steps[state.stepIndex]!;
  const waiting = state.status === "awaiting-action";
  const playing = state.status === "playing";

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const playLabel = waiting ? "Waiting for your action" : playing ? "Pause" : state.status === "ended" ? "Replay" : "Play";

  return (
    <div className="cs-controls">
      <div className="cs-progress" aria-hidden="true">
        {demo.steps.map((s) => (
          <span key={s.id} className="cs-progress__segment">
            <span
              className="cs-progress__fill"
              style={{
                transform: `scaleX(${s.index < state.stepIndex ? 1 : s.index > state.stepIndex ? 0 : stepProgress(s, state.time)})`,
              }}
            />
          </span>
        ))}
      </div>

      <div className="cs-controls__row">
        <div className="cs-controls__buttons" role="group" aria-label="Playback">
          <button type="button" className="cs-icon-button" onClick={() => void orchestrator?.restart()} aria-label="Restart" disabled={!orchestrator}>
            <Icon name="restart" />
          </button>
          <button
            type="button"
            className="cs-icon-button"
            onClick={() => void orchestrator?.previous()}
            aria-label="Previous step"
            disabled={!orchestrator}
          >
            <Icon name="previous" />
          </button>
          <button
            ref={playRef}
            type="button"
            className="cs-icon-button cs-icon-button--primary"
            onClick={() => void orchestrator?.togglePlay()}
            aria-label={playLabel}
            aria-disabled={waiting || undefined}
            disabled={!orchestrator}
          >
            <Icon name={waiting ? "wait" : playing ? "pause" : "play"} />
          </button>
          <button
            type="button"
            className="cs-icon-button"
            onClick={() => void orchestrator?.next()}
            aria-label="Next step"
            disabled={!orchestrator || state.stepIndex >= total - 1}
          >
            <Icon name="next" />
          </button>
        </div>

        <p className="cs-step-label">
          <span className="cs-step-count">
            Step {state.stepIndex + 1} of {total}
          </span>{" "}
          <span className="cs-step-title">{step.title}</span>
          {waiting && <span className="cs-badge cs-badge--action">Action required</span>}
        </p>

        <button
          type="button"
          className="cs-button cs-button--secondary cs-copy"
          disabled={!command}
          onClick={async () => setCopied(command ? await copyText(command) : false)}
          aria-label={command ? `Copy command: ${command}` : "No command to copy"}
        >
          {copied ? "Copied" : "Copy command"}
        </button>
      </div>
      <span className="cs-visually-hidden" aria-live="polite">
        {copied ? "Command copied to clipboard" : ""}
      </span>
    </div>
  );
}

const GATE_LABELS: Record<GateState, string> = {
  pending: "Action required",
  completed: "Done",
  skipped: "Skipped",
};

function StepList({ demo, state, onSelect }: { demo: CompiledDemo; state: OrchestratorState; onSelect: (i: number) => void }) {
  return (
    <nav className="cs-steps" aria-label="Walkthrough steps">
      <ol>
        {demo.steps.map((s) => {
          const gate = state.gates[s.id];
          const current = s.index === state.stepIndex;
          return (
            <li key={s.id}>
              <button type="button" aria-current={current ? "step" : undefined} onClick={() => onSelect(s.index)}>
                <span className="cs-steps__number">{s.index + 1}</span>
                <span className="cs-steps__title">{s.title}</span>
                {gate && gate !== "pending" && <span className={`cs-badge cs-badge--${gate}`}>{GATE_LABELS[gate]}</span>}
                {gate === "pending" && <span className="cs-badge cs-badge--gate">Needs action</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Announces step changes and waits to screen reader users. */
function Announcer({ demo, state }: { demo: CompiledDemo; state: OrchestratorState }) {
  const message = useMemo(() => {
    if (state.status === "idle") return "";
    const step = demo.steps[state.stepIndex]!;
    const base = `Step ${state.stepIndex + 1} of ${demo.steps.length}: ${step.title}.`;
    if (state.status === "awaiting-action") {
      const toggles = step.overlays.flatMap((o) =>
        o.type === "settings-window" ? o.settings.filter((s) => s.turnOn).map((s) => s.label) : [],
      );
      if (toggles.length) return `${base} Playback is waiting. Turn on ${toggles.join(" and ")} to continue.`;
      const labels = step.overlays.flatMap((o) => ("actions" in o ? (o.actions ?? []).map((a) => a.label) : []));
      return `${base} Playback is waiting. Choose ${labels.join(" or ")} to continue.`;
    }
    if (state.status === "ended") return `${base} End of walkthrough.`;
    return base;
  }, [demo, state.status, state.stepIndex]);
  return (
    <div className="cs-visually-hidden" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}

function Icon({ name }: { name: "play" | "pause" | "next" | "previous" | "restart" | "wait" }) {
  const paths: Record<typeof name, string> = {
    play: "M8 5v14l11-7z",
    pause: "M7 5h4v14H7zM13 5h4v14h-4z",
    next: "M6 6l8.5 6L6 18zM16 6h2v12h-2z",
    previous: "M18 6l-8.5 6L18 18zM6 6h2v12H6z",
    restart: "M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z",
    wait: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.4l3.6 2.1-.8 1.3L11 13V7z",
  };
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d={paths[name]} fill="currentColor" />
    </svg>
  );
}
