import type { OverlayProps } from "./types.ts";
import type { Overlay } from "../../core/schema.ts";

type ImageOverlayData = Extract<Overlay, { type: "image" }>;

/**
 * A local screenshot or illustration of an application or browser state.
 *
 * With `frame: false` the image is shown without a card, for an image that
 * is a whole dialog. It looks like the real thing, so it carries the same
 * "Simulated" label as the app windows.
 */
export function ImageOverlay({ overlay, baseUrl }: OverlayProps<ImageOverlayData>) {
  const bare = overlay.frame === false;
  // Like the terminal recording, chosen once when the image appears.
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const src = reduceMotion && overlay.srcReducedMotion ? overlay.srcReducedMotion : overlay.src;
  return (
    <figure className={bare ? "cs-image cs-image--bare" : "cs-image"}>
      <img src={new URL(src, baseUrl).href} alt={overlay.alt} />
      {(overlay.caption || bare) && (
        <figcaption>
          {overlay.caption}
          {bare && <span className="cs-window__simulated">Simulated</span>}
        </figcaption>
      )}
    </figure>
  );
}
