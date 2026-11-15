/**
 * Embed a CLIscenes walkthrough in a Docusaurus site.
 *
 * Copy this file to src/components/CLIscenesEmbed.jsx, then in any .mdx page:
 *
 *   import CLIscenesEmbed from "@site/src/components/CLIscenesEmbed";
 *
 *   <CLIscenesEmbed
 *     src="https://docs.example.com/cliscenes/?demo=cli-signin"
 *     title="Interactive walkthrough: sign in to the CLI"
 *   />
 *
 * The walkthrough follows the site's light/dark toggle without reloading, and
 * the iframe resizes to fit its content.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useColorMode } from "@docusaurus/theme-common";

export default function CLIscenesEmbed({ src, title, height = 560 }) {
  const { colorMode } = useColorMode();
  const frame = useRef(null);
  const [frameHeight, setFrameHeight] = useState(height);

  const sendTheme = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: "cliscenes:set-theme", theme: colorMode }, "*");
  }, [colorMode]);

  // Follow the site's theme toggle live.
  useEffect(sendTheme, [sendTheme]);

  // Size the iframe to the walkthrough.
  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "cliscenes:height") setFrameHeight(event.data.height);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const url = `${src}${src.includes("?") ? "&" : "?"}embed=1`;
  return (
    <iframe
      ref={frame}
      src={url}
      title={title}
      loading="lazy"
      allow="clipboard-write"
      // Send the theme again once the walkthrough has loaded.
      onLoad={sendTheme}
      style={{ display: "block", width: "100%", height: frameHeight, border: 0, borderRadius: 12 }}
    />
  );
}
