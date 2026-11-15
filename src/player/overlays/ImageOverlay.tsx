import type { OverlayProps } from "./types.ts";
import type { Overlay } from "../../core/schema.ts";

type ImageOverlayData = Extract<Overlay, { type: "image" }>;

/** A local screenshot or illustration of an application or browser state. */
export function ImageOverlay({ overlay, baseUrl }: OverlayProps<ImageOverlayData>) {
  return (
    <figure className="cs-image">
      <img src={new URL(overlay.src, baseUrl).href} alt={overlay.alt} />
      {overlay.caption && <figcaption>{overlay.caption}</figcaption>}
    </figure>
  );
}
