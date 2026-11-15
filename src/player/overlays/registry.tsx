/**
 * Maps each overlay `type` to the component that renders it.
 *
 * The mapped type below makes TypeScript report an error if a type is added
 * to the schema (src/core/schema.ts) without a component here.
 */
import type { ComponentType } from "react";
import type { Overlay, OverlayType } from "../../core/schema.ts";
import type { OverlayProps } from "./types.ts";
import { AuthPrompt } from "./AuthPrompt.tsx";
import { AppWindow } from "./AppWindow.tsx";
import { ImageOverlay } from "./ImageOverlay.tsx";
import { Annotation } from "./Annotation.tsx";

type Registry = { [K in OverlayType]: ComponentType<OverlayProps<Extract<Overlay, { type: K }>>> };

export const overlayComponents: Registry = {
  "auth-prompt": AuthPrompt,
  "app-window": AppWindow,
  image: ImageOverlay,
  annotation: Annotation,
};

export function OverlayView(props: OverlayProps) {
  const Component = overlayComponents[props.overlay.type] as ComponentType<OverlayProps>;
  return <Component {...props} />;
}
