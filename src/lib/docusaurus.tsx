/**
 * Entry point for `cliscenes/docusaurus`: a walkthrough component for MDX.
 *
 *   import CLIscene from "cliscenes/docusaurus";
 *
 *   <CLIscene walkthrough="figma-touch-id" />
 *   <CLIscene walkthrough="figma-touch-id" header steps />   (also show the title and step list)
 *
 * Looks for walkthroughs in static/walkthroughs/ (made with
 * `cliscenes build walkthroughs --out static/walkthroughs`) and applies the
 * site's baseUrl. Styles load automatically. The walkthrough follows the
 * site's light/dark toggle, because Docusaurus sets data-theme on <html>.
 */
import useBaseUrl from "@docusaurus/useBaseUrl";
// The built file keeps this import, so the site's bundler adds the styles.
import "cliscenes/style.css";
import { CLIscene as BaseCLIscene } from "./CLIscene.tsx";

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

export default function CLIscene({ walkthrough, src, header, steps }: DocusaurusCLISceneProps) {
  const path = src ?? (walkthrough ? `/walkthroughs/${walkthrough}/` : "");
  const url = useBaseUrl(path);
  if (!path) throw new Error('<CLIscene> needs a walkthrough="…" or src="…" prop.');
  return <BaseCLIscene src={url} header={header} steps={steps} />;
}
