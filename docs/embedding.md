# Embedding

`npm run build` writes a static site to `dist/`:

```
dist/
  index.html                 player
  embed-example.html         example host page
  assets/                    player JavaScript and CSS
  demos/index.json
  demos/<id>/demo.json       manifest
  demos/<id>/demo.cast       asciicast v3 recording
  demos/<id>/demo.reduced-motion.cast   the same recording without typing animation
  demos/<id>/assets/         images
```

Host `dist/` on any static file server. It doesn't need a backend or the original source files.

## iframe

```html
<iframe
  src="https://docs.example.com/cliscenes/?demo=cli-signin&embed=1"
  title="Interactive walkthrough: sign in to a CLI with a desktop app"
  loading="lazy"
  allow="clipboard-write"
  style="width: 100%; height: 560px; border: 0;"
></iframe>
```

- `demo` chooses the walkthrough. `embed=1` hides the page header and demo list.
- `title` is required for accessibility. Describe the walkthrough, not "iframe".
- `allow="clipboard-write"` lets **Copy command** work inside the iframe.
- All asset URLs are relative, so `dist/` can live in any subfolder.

### Automatic height

The embedded player posts its content height to the parent page:

```js
{ type: "cliscenes:height", height: 512 }
```

Add this script to the host page to size iframes to fit their content:

```html
<script>
  window.addEventListener("message", (event) => {
    if (event.data?.type !== "cliscenes:height") return;
    for (const frame of document.querySelectorAll("iframe")) {
      if (frame.contentWindow === event.source) frame.style.height = event.data.height + "px";
    }
  });
</script>
```

Without the script, set a fixed height. 520–600px suits most walkthroughs at desktop widths.

### Light and dark mode

By default, the player follows the reader's system setting. Docs sites usually have their own theme toggle, so the host page can choose instead:

- **When the page loads:** add `&theme=light` or `&theme=dark` to the URL. `auto` (the default) follows the system.
- **Live, when the reader toggles the site's theme:** send a message to the iframe. The walkthrough switches without reloading, so the reader keeps their place.

```js
iframe.contentWindow.postMessage({ type: "cliscenes:set-theme", theme: "dark" }, "*");
```

The Docusaurus and Mintlify examples below do this for you.

### Reduced motion

Readers whose system asks for reduced motion automatically get `demo.reduced-motion.cast`, a recording where commands appear whole instead of being typed. Its timing is identical, so gates and overlays behave the same. Overlay animations are also turned off. Host pages don't need to do anything.

## Opening files directly

Opening `dist/index.html` from disk (`file://`) doesn't work, because browsers block `fetch` for local files. Use `npm run preview` or any static server.

## Docusaurus

Tested with Docusaurus 3.10, including a production build (`npm run build`), which renders pages on the server.

1. Copy [`examples/docusaurus/CLIscenesEmbed.jsx`](../examples/docusaurus/CLIscenesEmbed.jsx) to `src/components/CLIscenesEmbed.jsx` in your site.
2. Use it in any `.mdx` page:

```mdx
import CLIscenesEmbed from "@site/src/components/CLIscenesEmbed";

<CLIscenesEmbed
  src="https://docs.example.com/cliscenes/?demo=cli-signin"
  title="Interactive walkthrough: sign in to the CLI"
/>
```

The component follows the site's light/dark toggle live (through `useColorMode`) and resizes the iframe to fit.

## Mintlify

Tested with the Mintlify CLI 4.3 (`mint dev`).

1. Copy [`examples/mintlify/cliscenes-embed.jsx`](../examples/mintlify/cliscenes-embed.jsx) to `snippets/cliscenes-embed.jsx` in your docs.
2. Use it in any `.mdx` page:

```mdx
import { CLIscenesEmbed } from "/snippets/cliscenes-embed.jsx";

<CLIscenesEmbed
  src="https://docs.example.com/cliscenes/?demo=cli-signin"
  title="Interactive walkthrough: sign in to the CLI"
/>
```

The snippet follows Mintlify's theme menu live (Mintlify marks dark mode with a `dark` class on `<html>`) and resizes the iframe to fit.

Mintlify's content column is narrow (about 520px), so walkthroughs use their stacked layout there: UI outside the terminal appears below it. Keep `terminal.cols` around 60–64 so terminal text stays readable.

## Other documentation platforms

Both examples above use an iframe; native, iframe-free components are tracked in the issues. For other platforms (MkDocs, GitBook, and so on):

- **Hosting:** the platform must either serve `dist/` as static files or let you embed an iframe from another origin where `dist/` is hosted.
- **iframes in MDX:** write attributes in camelCase and `style` as an object, for example `style={{ width: "100%", height: 560, border: 0 }}`.
- **Content Security Policy:** if the docs site sets `frame-src`, it must allow the origin hosting the player.
- **Height:** if the platform doesn't let you add the resize script, use a fixed height.
- **Clipboard:** include `allow="clipboard-write"`, or Copy command fails silently in some browsers.
- **Theme:** pass `&theme=` in the URL, or send `cliscenes:set-theme` messages if the platform lets you run a script.
