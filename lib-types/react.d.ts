import type { JSX } from "react";

export interface CLISceneProps {
  /** URL of a walkthrough folder made by `cliscenes build`, such as "/walkthroughs/cli-signin/", or of its demo.json. */
  src: string;
}

/** Renders a generated walkthrough. Import "cliscenes/style.css" once alongside it. */
export function CLIscene(props: CLISceneProps): JSX.Element;
