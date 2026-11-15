/**
 * Embed a CLIscenes walkthrough in a Mintlify site.
 *
 * Copy this file to snippets/cliscenes-embed.jsx, then in any .mdx page:
 *
 *   import { CLIscenesEmbed } from "/snippets/cliscenes-embed.jsx";
 *
 *   <CLIscenesEmbed
 *     src="https://docs.example.com/cliscenes/?demo=cli-signin"
 *     title="Interactive walkthrough: sign in to the CLI"
 *   />
 *
 * The walkthrough follows the site's light/dark toggle without reloading, and
 * the iframe resizes to fit its content. Mintlify provides React hooks to
 * snippets, so there are no imports.
 */
export const CLIscenesEmbed = ({ src, title, height = 560 }) => {
  const frameRef = useRef(null);
  const [frameHeight, setFrameHeight] = useState(height);

  useEffect(() => {
    const frame = frameRef.current;
    // Mintlify marks dark mode with a "dark" class on <html>.
    const sendTheme = () => {
      const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
      frame?.contentWindow?.postMessage({ type: "cliscenes:set-theme", theme }, "*");
    };
    const onMessage = (event) => {
      if (event.source !== frame?.contentWindow) return;
      if (event.data?.type === "cliscenes:height") setFrameHeight(event.data.height);
    };

    const observer = new MutationObserver(sendTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("message", onMessage);
    frame?.addEventListener("load", sendTheme);
    sendTheme();
    return () => {
      observer.disconnect();
      window.removeEventListener("message", onMessage);
      frame?.removeEventListener("load", sendTheme);
    };
  }, []);

  const url = src + (src.includes("?") ? "&" : "?") + "embed=1";
  return (
    <iframe
      ref={frameRef}
      src={url}
      title={title}
      loading="lazy"
      allow="clipboard-write"
      style={{ display: "block", width: "100%", height: frameHeight, border: 0, borderRadius: 12 }}
    />
  );
};
