import type { JSX } from "react";

export interface DocusaurusCLISceneProps {
  /** Walkthrough id (its source file name), served from static/walkthroughs/<id>/. */
  walkthrough?: string;
  /** Or a full path to a walkthrough folder, relative to the site root. */
  src?: string;
  /** Also show the walkthrough's title, description, and prerequisites. Default: hidden, since the page usually has its own. */
  header?: boolean;
  /** Also show the clickable step list under the controls. Default: hidden. */
  steps?: boolean;
}

/** A walkthrough for Docusaurus MDX pages. Styles load automatically. */
export default function CLIscene(props: DocusaurusCLISceneProps): JSX.Element;
