import type { OverlayProps } from "./types.ts";
import type { Overlay } from "../../core/schema.ts";

type ImageOverlayData = Extract<Overlay, { type: "image" }>;

/**
 * A local screenshot or illustration of an application or browser state.
 *
 * With `frame: false` the image is shown without a card, for an image that
 * is a whole dialog. It looks like the real thing, so it carries the same
 * "Simulated" label as the app windows.
 *
 * With `actions`, each action is a real button laid over the button the image
 * shows, so the reader clicks the pictured button. While the step waits for
 * the reader, the areas are outlined so it's clear where to click.
 */
export function ImageOverlay({ overlay, baseUrl, waiting, onAction }: OverlayProps<ImageOverlayData>) {
  const bare = overlay.frame === false;
  // Like the terminal recording, chosen once when the image appears.
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const src = reduceMotion && overlay.srcReducedMotion ? overlay.srcReducedMotion : overlay.src;
  const actions = (overlay.actions ?? []).filter((a) => a.area);
  const primary = actions.findIndex((a) => a.style === "primary");

  return (
    <figure className={bare ? "cs-image cs-image--bare" : "cs-image"} data-waiting={waiting ? "" : undefined}>
      <div className="cs-image__stage">
        <img src={new URL(src, baseUrl).href} alt={overlay.alt} />
        {actions.map((action, i) => (
          <button
            key={`${action.label}-${i}`}
            type="button"
            className="cs-hotspot"
            style={{
              left: `${action.area!.x}%`,
              top: `${action.area!.y}%`,
              width: `${action.area!.width}%`,
              height: `${action.area!.height}%`,
            }}
            data-primary-action={i === primary ? "" : undefined}
            onClick={() => onAction(action)}
          >
            <span className="cs-visually-hidden">{action.label}</span>
          </button>
        ))}
      </div>
      {(overlay.caption || bare) && (
        <figcaption>
          {overlay.caption}
          {bare && <span className="cs-window__simulated">Simulated</span>}
        </figcaption>
      )}
    </figure>
  );
}
