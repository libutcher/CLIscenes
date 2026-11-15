import type { Overlay, OverlayAction } from "../../core/schema.ts";

/** Props every overlay component receives. */
export interface OverlayProps<T extends Overlay = Overlay> {
  overlay: T;
  /** True while playback is stopped at this step's gate. */
  waiting: boolean;
  /** URL of the demo folder, for resolving images. */
  baseUrl: string;
  onAction: (action: OverlayAction) => void;
}
