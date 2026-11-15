import type { JSX } from "react";

export interface DocusaurusCLISceneProps {
  /** Walkthrough id (its source file name), served from static/walkthroughs/<id>/. */
  walkthrough?: string;
  /** Or a full path to a walkthrough folder, relative to the site root. */
  src?: string;
}

/** A walkthrough for Docusaurus MDX pages. Styles load automatically. */
export default function CLIscene(props: DocusaurusCLISceneProps): JSX.Element;
