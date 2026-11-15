import { useId } from "react";
import type { OverlayProps } from "./types.ts";
import type { Overlay } from "../../core/schema.ts";
import { Actions } from "./Actions.tsx";

type AuthPromptOverlay = Extract<Overlay, { type: "auth-prompt" }>;

/**
 * A desktop authentication request, drawn as a plain wireframe window (the
 * same style as the settings window): the requesting program and the app side
 * by side, the account, what approving grants, and how the reader confirms.
 *
 * It's a non-modal dialog, so the terminal stays visible and selectable while
 * it's open. The design is generic and isn't a copy of any real product's prompt.
 */
export function AuthPrompt({ overlay, waiting, baseUrl, onAction }: OverlayProps<AuthPromptOverlay>) {
  const imageUrl = (src?: string) => (src ? new URL(src, baseUrl).href : undefined);
  const titleId = useId();
  const messageId = useId();
  // Desktop convention: the secondary action on the left, the primary on the right.
  const actions = [...overlay.actions].sort((a, b) => Number(a.style === "primary") - Number(b.style === "primary"));

  return (
    <div className="cs-auth" role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={messageId}>
        <header className="cs-window__chrome">
          <span className="cs-window__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="cs-window__title">{overlay.app}</span>
        </header>

        <div className="cs-auth__body">
          <div className="cs-auth__parties" aria-hidden="true">
            {overlay.requester && (
              <>
                <Party
                  label={overlay.requester}
                  icon={<TerminalIcon />}
                  image={imageUrl(overlay.requesterIcon)}
                  tone="requester"
                />
                <span className="cs-auth__link">
                  <span />
                  <span />
                  <span />
                </span>
              </>
            )}
            <Party label={overlay.app} icon={<AppIcon />} image={imageUrl(overlay.icon)} tone="app" />
          </div>

          <h3 id={titleId} className="cs-auth__title">
            {overlay.title}
          </h3>
          <p id={messageId} className="cs-auth__message">
            {overlay.message}
          </p>

          {overlay.account && (
            <div className="cs-auth__account">
              <span className="cs-auth__avatar" aria-hidden="true">
                {initials(overlay.account.name)}
              </span>
              <span className="cs-auth__account-text">
                <span className="cs-auth__account-name">{overlay.account.name}</span>
                {overlay.account.email && <span className="cs-auth__account-email">{overlay.account.email}</span>}
              </span>
            </div>
          )}

          {overlay.details && overlay.details.length > 0 && (
            <ul className="cs-auth__details">
              {overlay.details.map((detail) => (
                <li key={detail}>
                  <CheckIcon />
                  {detail}
                </li>
              ))}
            </ul>
          )}

          {overlay.verification === "biometric" && (
            <div className="cs-auth__verify">
              <FingerprintIcon />
              <span>Confirm with your fingerprint or system password.</span>
            </div>
          )}
          {overlay.verification === "password" && (
            <div className="cs-auth__password">
              <span className="cs-auth__password-label">Password</span>
              <span className="cs-auth__password-field" aria-label="Password (simulated, already filled in)">
                ••••••••••••
              </span>
            </div>
          )}

          {waiting && <p className="cs-auth__waiting">The terminal is waiting for your response.</p>}
          <div className="cs-auth__actions">
            <Actions actions={actions} onAction={onAction} />
          </div>
        </div>
    </div>
  );
}

function Party({
  label,
  icon,
  image,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  /** Author-supplied icon. Replaces the generic one. */
  image?: string;
  tone: "requester" | "app";
}) {
  return (
    <span className="cs-auth__party">
      {image ? (
        // Decorative: the name is shown right below it.
        <img className="cs-auth__party-icon cs-auth__party-icon--custom" src={image} alt="" />
      ) : (
        <span className={`cs-auth__party-icon cs-auth__party-icon--${tone}`}>{icon}</span>
      )}
      <span className="cs-auth__party-label">{label}</span>
    </span>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

const svg = { viewBox: "0 0 24 24", "aria-hidden": true, focusable: false } as const;

function TerminalIcon() {
  return (
    <svg {...svg} width="26" height="26">
      <path d="M5 8l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 16h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function AppIcon() {
  return (
    <svg {...svg} width="26" height="26">
      <path
        d="M12 2.5 4.5 5.4v6.1c0 4.6 3.2 8.6 7.5 10 4.3-1.4 7.5-5.4 7.5-10V5.4L12 2.5Z"
        fill="currentColor"
        opacity="0.25"
      />
      <path
        d="M12 7.5a2.6 2.6 0 0 0-1.2 4.9V16h2.4v-3.6A2.6 2.6 0 0 0 12 7.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...svg} width="16" height="16" className="cs-auth__check">
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FingerprintIcon() {
  return (
    <svg {...svg} width="30" height="30" className="cs-auth__fingerprint">
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M6.1 7.6A7.5 7.5 0 0 1 19.5 12v1" />
        <path d="M4.6 11.2A7.6 7.6 0 0 1 5 9.5" />
        <path d="M4.5 14.5v-2.5" />
        <path d="M8 18.5a9 9 0 0 1-1.1-4.3V12a5.1 5.1 0 0 1 10.2 0v1.6" />
        <path d="M17 17.1c-.3 1.1-.7 2.1-1.2 3" />
        <path d="M12 12v2.2a9 9 0 0 1-1.6 5.4" />
        <path d="M14.6 14.3a12 12 0 0 1-1.5 5.9" />
        <path d="M9.5 12a2.5 2.5 0 0 1 5 0v.9" />
      </g>
    </svg>
  );
}
