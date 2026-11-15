/**
 * <CLIscene>: render a generated walkthrough in any React app.
 *
 *   import { CLIscene } from "cliscenes/react";
 *   import "cliscenes/style.css";
 *
 *   <CLIscene src="/walkthroughs/cli-signin/" />
 *
 * `src` is the URL of a walkthrough folder made by `cliscenes build` (or of
 * its demo.json). Safe to render on the server: the walkthrough loads in the
 * browser.
 */
import { useEffect, useState } from "react";
import { MANIFEST_VERSION, type CompiledDemo } from "../core/types.ts";
import { Walkthrough } from "../player/Walkthrough.tsx";

export interface CLISceneProps {
  /** URL of a walkthrough folder, such as "/walkthroughs/cli-signin/", or of its demo.json. */
  src: string;
}

type Loaded = { demo: CompiledDemo; baseUrl: string };

export function CLIscene({ src }: CLISceneProps) {
  const [result, setResult] = useState<Loaded | Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    const manifestUrl = new URL(src.endsWith(".json") ? src : src.replace(/\/?$/, "/demo.json"), window.location.href);
    fetch(manifestUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Couldn't load ${manifestUrl.pathname} (${response.status}).`);
        const demo = (await response.json()) as CompiledDemo;
        if (demo.manifestVersion !== MANIFEST_VERSION) {
          throw new Error("This walkthrough was built by a different CLIscenes version. Run cliscenes build again.");
        }
        return { demo, baseUrl: new URL(".", manifestUrl).href };
      })
      .then(
        (loaded) => !cancelled && setResult(loaded),
        (error: unknown) => !cancelled && setResult(error instanceof Error ? error : new Error(String(error))),
      );
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (result instanceof Error) {
    return (
      <div className="cs-walkthrough" role="alert">
        Couldn't show this walkthrough. {result.message}
      </div>
    );
  }
  if (!result) {
    // Reserve space so the page doesn't jump when the walkthrough appears.
    return (
      <div className="cs-walkthrough cs-walkthrough--loading" aria-busy="true">
        Loading walkthrough…
      </div>
    );
  }
  return <Walkthrough demo={result.demo} baseUrl={result.baseUrl} />;
}
