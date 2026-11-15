import { useId } from "react";
import type { OverlayProps } from "./types.ts";
import type { Overlay } from "../../core/schema.ts";
import { Actions } from "./Actions.tsx";

type AppWindowOverlay = Extract<Overlay, { type: "app-window" }>;

/** A simple mock desktop application window. Not an application simulator. */
export function AppWindow({ overlay, onAction }: OverlayProps<AppWindowOverlay>) {
  const titleId = useId();
  const paragraphs = overlay.body?.split(/\n\s*\n/) ?? [];
  return (
    <section className="cs-window" aria-labelledby={titleId}>
      <header className="cs-window__chrome">
        <span className="cs-window__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span id={titleId} className="cs-window__title">
          {overlay.title}
        </span>
      </header>
      <div className="cs-window__body">
        {overlay.heading && <h3 className="cs-window__heading">{overlay.heading}</h3>}
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {overlay.fields && (
          <dl className="cs-window__fields">
            {overlay.fields.map((field) => (
              <div key={field.label} className="cs-window__field">
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {overlay.annotations?.map((note, i) => (
          <p key={i} className="cs-note">
            {note}
          </p>
        ))}
        <Actions actions={overlay.actions ?? []} onAction={onAction} />
      </div>
    </section>
  );
}
