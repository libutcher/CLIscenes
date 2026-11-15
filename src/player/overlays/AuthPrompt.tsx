import { useId } from "react";
import type { OverlayProps } from "./types.ts";
import type { Overlay } from "../../core/schema.ts";
import { Actions } from "./Actions.tsx";

type AuthPromptOverlay = Extract<Overlay, { type: "auth-prompt" }>;

/**
 * A desktop authentication request. It is a non-modal dialog: the terminal
 * stays visible and its text stays selectable while the prompt is open.
 */
export function AuthPrompt({ overlay, waiting, onAction }: OverlayProps<AuthPromptOverlay>) {
  const titleId = useId();
  const messageId = useId();
  return (
    <div className="cs-auth" role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={messageId}>
      <div className="cs-auth__app">
        <span className="cs-auth__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path
              d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"
              fill="currentColor"
            />
          </svg>
        </span>
        {overlay.app}
      </div>
      <h3 id={titleId} className="cs-auth__title">
        {overlay.title}
      </h3>
      <p id={messageId} className="cs-auth__message">
        {overlay.message}
      </p>
      {waiting && <p className="cs-auth__waiting">The terminal is waiting for your response.</p>}
      <Actions actions={overlay.actions} onAction={onAction} />
    </div>
  );
}
