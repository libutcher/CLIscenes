/**
 * The authoring format: what a documentation writer puts in a YAML or JSON file.
 *
 * Every field is validated here so that mistakes are reported with a clear
 * path ("steps[2].overlay.actions[0].next") before anything is generated.
 */
import { z } from "zod";
import { contrast, darkModeAccent, HEX_COLOR, MIN_TEXT_CONTRAST } from "./theme.ts";

const text = z.string().trim().min(1);

/** A path to a local file, relative to the source file. */
const localPath = text.refine((value) => !/^[a-z]+:/i.test(value) && !value.startsWith("/"), {
  message: "Use a relative path to a local image file (remote URLs are not supported).",
});

const color = z.string().regex(HEX_COLOR, 'Use a hex color such as "#2457c5".');

const themeColors = z.strictObject({
  accent: color.optional(),
  accentText: color.optional(),
  backdrop: color.optional(),
});

/** Brand colors for one walkthrough. Text on the accent must stay readable. */
export const themeSchema = themeColors
  .extend({ dark: themeColors.optional() })
  .superRefine((theme, ctx) => {
    const valid = (value?: string): value is string => value !== undefined && HEX_COLOR.test(value);
    const check = (accent: string | undefined, text: string | undefined, path: (string | number)[]) => {
      // Invalid colors are already reported by the field rules.
      if (!valid(accent) || !valid(text)) return;
      const ratio = contrast(accent, text);
      if (ratio < MIN_TEXT_CONTRAST) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `Text color ${text} on ${accent} has a contrast of ${ratio.toFixed(2)}:1; it needs at least ${MIN_TEXT_CONTRAST}:1. Remove accentText to choose one automatically.`,
        });
      }
    };
    check(theme.accent, theme.accentText, ["accentText"]);
    const darkAccent = theme.dark?.accent ?? (valid(theme.accent) ? darkModeAccent(theme.accent) : undefined);
    check(darkAccent, theme.dark?.accentText, ["dark", "accentText"]);
  });

/** A button on an overlay. Clicking it moves the walkthrough to `next`. */
export const actionSchema = z.strictObject({
  label: text,
  /** Step to go to. Defaults to the step after the one showing the overlay. */
  next: text.optional(),
  /** `primary` actions get emphasis and receive focus when the step waits. */
  style: z.enum(["primary", "secondary"]).default("primary"),
});

// ---------------------------------------------------------------------------
// Overlay types. To add a type: add a schema here, add it to `overlaySchema`,
// then register a component in src/player/overlays/registry.tsx.
// ---------------------------------------------------------------------------

export const authPromptSchema = z.strictObject({
  type: z.literal("auth-prompt"),
  /** Name of the (fictional) desktop application showing the prompt. */
  app: text.default("Desktop app"),
  /** Local image for the app's icon. Defaults to a generic icon. */
  icon: localPath.optional(),
  /** The program asking for access, such as "Terminal". Shown beside the app. */
  requester: text.optional(),
  /** Local image for the requester's icon. Defaults to a terminal icon. */
  requesterIcon: localPath.optional(),
  title: text,
  message: text,
  /** The account the request is for. */
  account: z.strictObject({ name: text, email: text.optional() }).optional(),
  /** What approving allows, one short line each. */
  details: z.array(text).optional(),
  /** How the reader confirms: a fingerprint cue, a (simulated) password field, or buttons only. */
  verification: z.enum(["none", "biometric", "password"]).default("none"),
  actions: z.array(actionSchema).min(1),
});

export const appWindowSchema = z.strictObject({
  type: z.literal("app-window"),
  /** Text in the window's title bar. */
  title: text,
  heading: text.optional(),
  /** Body text. Blank lines separate paragraphs. */
  body: text.optional(),
  /** Simple labelled settings, rendered as a read-only list. */
  fields: z
    .array(z.strictObject({ label: text, value: text }))
    .optional(),
  actions: z.array(actionSchema).optional(),
  /** Short instructional notes rendered inside the window. */
  annotations: z.array(text).optional(),
});

export const imageSchema = z.strictObject({
  type: z.literal("image"),
  /** Path to a local image, relative to the source file. */
  src: localPath,
  alt: z.string(),
  caption: text.optional(),
});

export const annotationSchema = z.strictObject({
  type: z.literal("annotation"),
  text: text,
});

export const overlaySchema = z.discriminatedUnion("type", [
  authPromptSchema,
  appWindowSchema,
  imageSchema,
  annotationSchema,
]);

export const terminalStepSchema = z
  .strictObject({
    /** Command shown after the prompt. Never executed. */
    command: text.optional(),
    /** Output printed after the command (or on its own). */
    output: z.string().optional(),
    /** Type the command one character at a time. */
    typing: z.boolean().default(true),
    /** Clear the terminal before this step. */
    clear: z.boolean().default(false),
  })
  .refine((t) => t.command !== undefined || t.output !== undefined || t.clear, {
    message: "A terminal block needs a command, output, or clear: true.",
  });

const stepId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Step ids use lowercase letters, numbers, and hyphens.");

export const stepSchema = z
  .strictObject({
    id: stepId,
    title: text,
    terminal: terminalStepSchema.optional(),
    /** One external UI element. Use `overlays` for several. */
    overlay: overlaySchema.optional(),
    overlays: z.array(overlaySchema).optional(),
    /** Stop playback at the end of this step until the reader clicks an action. */
    waitForAction: z.boolean().default(false),
    /**
     * End guided playback after this step. Later steps are then reachable only
     * through an overlay action's `next` or step navigation (useful for
     * alternative paths such as "If you deny the request").
     */
    finish: z.boolean().default(false),
    /** Seconds to hold after the step's content before moving on. */
    pause: z.number().min(0).max(30).optional(),
  })
  .refine((s) => !(s.overlay && s.overlays), {
    message: "Use either `overlay` or `overlays`, not both.",
  })
  .refine((s) => !(s.waitForAction && s.finish), {
    message: "A step can use waitForAction or finish, not both.",
  })
  .refine((s) => s.terminal || s.overlay || s.overlays?.length, {
    message: "A step needs a terminal block, an overlay, or both.",
  });

export const demoSchema = z
  .strictObject({
    title: text,
    description: z.string().default(""),
    /** `split`: terminal beside the external UI. `overlay`: UI floats over the terminal. */
    layout: z.enum(["split", "overlay"]).default("split"),
    /** Brand colors for this walkthrough. */
    theme: themeSchema.optional(),
    terminal: z
      .strictObject({
        cols: z.number().int().min(20).max(240).default(80),
        rows: z.number().int().min(4).max(80).default(16),
        prompt: z.string().default("$ "),
        /** Seconds per typed character. */
        typingSpeed: z.number().min(0.005).max(0.5).default(0.05),
      })
      .prefault({}),
    steps: z.array(stepSchema).min(1),
  })
  .superRefine((demo, ctx) => {
    const ids = demo.steps.map((s) => s.id);
    const known = new Set<string>();

    demo.steps.forEach((step, i) => {
      if (known.has(step.id)) {
        ctx.addIssue({ code: "custom", path: ["steps", i, "id"], message: `Duplicate step id "${step.id}".` });
      }
      known.add(step.id);
    });

    demo.steps.forEach((step, i) => {
      const overlays = step.overlays ?? (step.overlay ? [step.overlay] : []);
      const key = step.overlays ? "overlays" : "overlay";

      overlays.forEach((overlay, o) => {
        const actions = "actions" in overlay ? (overlay.actions ?? []) : [];
        actions.forEach((action, a) => {
          if (action.next !== undefined && !ids.includes(action.next)) {
            const path = key === "overlays" ? ["steps", i, key, o, "actions", a, "next"] : ["steps", i, key, "actions", a, "next"];
            ctx.addIssue({
              code: "custom",
              path,
              message: `Unknown step "${action.next}". Known steps: ${ids.join(", ")}.`,
            });
          }
        });
      });

      if (step.waitForAction) {
        const hasAction = overlays.some((o) => "actions" in o && (o.actions?.length ?? 0) > 0);
        if (!hasAction) {
          ctx.addIssue({
            code: "custom",
            path: ["steps", i, "waitForAction"],
            message: "waitForAction needs an overlay with at least one action, or readers would be stuck.",
          });
        }
      }
    });
  });

export type DemoSource = z.infer<typeof demoSchema>;
export type StepSource = z.infer<typeof stepSchema>;
export type Overlay = z.infer<typeof overlaySchema>;
export type OverlayAction = z.infer<typeof actionSchema>;
export type OverlayType = Overlay["type"];

/** Turn zod issues into readable, file-relative messages. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path
      .map((part, i) => (typeof part === "number" ? `[${part}]` : i === 0 ? String(part) : `.${String(part)}`))
      .join("");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
