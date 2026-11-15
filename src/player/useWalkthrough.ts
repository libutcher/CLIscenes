/**
 * React glue: creates the terminal adapter and orchestrator, exposes the
 * orchestrator's state, and keeps the clock in sync while playing.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Orchestrator, type OrchestratorState } from "../core/orchestrator.ts";
import type { CompiledDemo } from "../core/types.ts";
import { createAsciinemaAdapter } from "./terminal/asciinemaAdapter.ts";

const IDLE: OrchestratorState = { status: "idle", stepIndex: 0, time: 0, gates: {}, visit: 0 };
const noopSubscribe = () => () => {};

export function useWalkthrough(demo: CompiledDemo, baseUrl: string) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [orchestrator, setOrchestrator] = useState<Orchestrator | null>(null);

  useEffect(() => {
    const container = terminalRef.current;
    if (!container) return;
    const adapter = createAsciinemaAdapter(container, {
      castUrl: new URL(demo.cast, baseUrl).href,
      cols: demo.terminal.cols,
      rows: demo.terminal.rows,
    });
    const instance = new Orchestrator(demo, adapter);
    setOrchestrator(instance);
    return () => {
      instance.dispose();
      container.replaceChildren();
      setOrchestrator(null);
    };
  }, [demo, baseUrl]);

  const state = useSyncExternalStore(
    orchestrator?.subscribe ?? noopSubscribe,
    orchestrator?.getState ?? (() => IDLE),
  );

  // Poll the terminal clock once per frame while playing.
  useEffect(() => {
    if (!orchestrator || state.status !== "playing") return;
    let frame = 0;
    const tick = () => {
      orchestrator.sync();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [orchestrator, state.status]);

  return { terminalRef, orchestrator, state };
}
