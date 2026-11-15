import type { OverlayAction } from "../../core/schema.ts";

/** Overlay buttons. The first primary action is marked for focus management. */
export function Actions({ actions, onAction }: { actions: OverlayAction[]; onAction: (a: OverlayAction) => void }) {
  if (actions.length === 0) return null;
  const primary = actions.findIndex((a) => a.style === "primary");
  return (
    <div className="cs-actions">
      {actions.map((action, i) => (
        <button
          key={`${action.label}-${i}`}
          type="button"
          className={`cs-button cs-button--${action.style}`}
          data-primary-action={i === primary ? "" : undefined}
          onClick={() => onAction(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
