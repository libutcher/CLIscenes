import type { OverlayProps } from "./types.ts";
import type { Overlay } from "../../core/schema.ts";

type AnnotationOverlay = Extract<Overlay, { type: "annotation" }>;

/** A short callout explaining what the developer is seeing or doing. */
export function Annotation({ overlay }: OverlayProps<AnnotationOverlay>) {
  return (
    <aside className="cs-annotation" aria-label="Note">
      <span className="cs-annotation__mark" aria-hidden="true">
        i
      </span>
      <p>{overlay.text}</p>
    </aside>
  );
}
