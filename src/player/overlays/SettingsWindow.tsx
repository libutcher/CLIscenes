import { useEffect, useId, useRef, useState } from "react";
import type { OverlayProps } from "./types.ts";
import { WindowChrome } from "./WindowChrome.tsx";
import type { Overlay } from "../../core/schema.ts";

type SettingsWindowOverlay = Extract<Overlay, { type: "settings-window" }>;

/** Pause between the last required toggle and moving on, so readers see the result. */
const CONTINUE_DELAY_MS = 900;

/**
 * A text-only wireframe of an app's settings window. Settings marked `turnOn`
 * are real switches the reader flips; once they're all on, the walkthrough
 * continues by itself. Other switches only show their state.
 */
export function SettingsWindow({ overlay, onAction }: OverlayProps<SettingsWindowOverlay>) {
  const titleId = useId();
  const [on, setOn] = useState(() => overlay.settings.map((s) => s.toggle === true));
  const required = overlay.settings.map((s, i) => (s.turnOn ? i : -1)).filter((i) => i !== -1);
  const complete = required.length > 0 && required.every((i) => on[i]);
  const sent = useRef(false);
  // The parent re-renders every frame during playback; keep the latest
  // callback without restarting the timer.
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(() => {
    if (!complete || sent.current) return;
    const timer = setTimeout(() => {
      sent.current = true;
      onActionRef.current({ label: "Continue", next: overlay.next, style: "primary" });
    }, CONTINUE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [complete, overlay.next]);

  const firstPending = required.find((i) => !on[i]);
  const remaining = required.filter((i) => !on[i]).length;

  return (
    <section className="cs-settings" aria-labelledby={titleId}>
      <WindowChrome title={overlay.title} titleId={titleId} />

      <div className="cs-settings__layout">
        <ul className="cs-settings__nav" aria-label="Settings sections">
          {overlay.nav.map((item, i) => (
            <li key={i} aria-current={item === overlay.section ? "true" : undefined}>
              {item}
            </li>
          ))}
        </ul>

        <div className="cs-settings__content">
          <h3 className="cs-settings__heading">{overlay.section}</h3>
          <ul className="cs-settings__list">
            {overlay.settings.map((setting, i) => (
              <Setting
                key={i}
                setting={setting}
                on={on[i] ?? false}
                primary={i === firstPending}
                onToggle={() => setOn((current) => current.map((value, j) => (j === i ? !value : value)))}
              />
            ))}
          </ul>

          {overlay.annotations?.map((note, i) => (
            <p key={i} className="cs-note">
              {note}
            </p>
          ))}
          {required.length > 0 && (
            <p className={`cs-settings__status${complete ? " cs-settings__status--done" : ""}`} aria-live="polite">
              {complete
                ? "All set. Continuing…"
                : `Turn on ${remaining === 1 ? "the highlighted setting" : `the ${remaining} highlighted settings`} to continue.`}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Setting({
  setting,
  on,
  primary,
  onToggle,
}: {
  setting: SettingsWindowOverlay["settings"][number];
  on: boolean;
  primary: boolean;
  onToggle: () => void;
}) {
  const labelId = useId();
  const descriptionId = useId();
  const practice = setting.turnOn;

  return (
    <li className={`cs-setting${practice ? " cs-setting--practice" : ""}${practice && on ? " cs-setting--done" : ""}`}>
      <div className="cs-setting__text">
        <span id={labelId} className="cs-setting__label">
          {setting.label}
          {practice && <span className={`cs-badge cs-badge--${on ? "completed" : "gate"}`}>{on ? "On" : "Turn on"}</span>}
        </span>
        {setting.description && (
          <span id={descriptionId} className="cs-setting__description">
            {setting.description}
          </span>
        )}
      </div>

      {setting.value !== undefined ? (
        <span className="cs-setting__value">{setting.value}</span>
      ) : practice ? (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          aria-describedby={setting.description ? descriptionId : undefined}
          className="cs-switch"
          data-primary-action={primary ? "" : undefined}
          onClick={onToggle}
        >
          <span className="cs-switch__knob" />
        </button>
      ) : (
        <>
          <span className="cs-switch cs-switch--static" data-on={on ? "" : undefined} aria-hidden="true">
            <span className="cs-switch__knob" />
          </span>
          <span className="cs-visually-hidden">{on ? "On" : "Off"}</span>
        </>
      )}
    </li>
  );
}
