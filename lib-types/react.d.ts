import type { JSX } from "react";

export interface CLISceneProps {
  /** URL of a walkthrough folder made by `cliscenes build`, such as "/walkthroughs/figma-touch-id/", or of its demo.json. */
  src: string;
  /** Also show the walkthrough's title, description, and prerequisites. Default: hidden, since the page usually has its own. */
  header?: boolean;
  /** Also show the clickable step list under the controls. Default: hidden. */
  steps?: boolean;
}

/** Renders a generated walkthrough. Import "cliscenes/style.css" once alongside it. */
export function CLIscene(props: CLISceneProps): JSX.Element;
