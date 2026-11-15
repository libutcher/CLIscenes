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

## Opening files directly

Opening `dist/index.html` from disk (`file://`) doesn't work, because browsers block `fetch` for local files. Use `npm run preview` or any static server.

## Documentation platforms

Requirements for platforms like Mintlify, Docusaurus, MkDocs, or GitBook (platform integrations aren't built yet):

- **Hosting:** the platform must either serve `dist/` as static files or let you embed an iframe from another origin where `dist/` is hosted.
- **iframes in MDX:** Mintlify and Docusaurus accept a raw `<iframe>` in MDX. In JSX, write attributes in camelCase and `style` as an object, for example `style={{ width: "100%", height: 560, border: 0 }}`.
- **Content Security Policy:** if the docs site sets `frame-src`, it must allow the origin hosting the player.
- **Height:** if the platform doesn't let you add the resize script, use a fixed height.
- **Clipboard:** include `allow="clipboard-write"`, or Copy command fails silently in some browsers.
- **Dark mode:** the player follows the reader's operating-system color scheme, not the docs site's theme toggle. Passing the site theme in is on the roadmap.

A native component (for example, a Mintlify or Docusaurus React component that renders the walkthrough without an iframe) is a possible future addition. The player is already a React component (`Walkthrough`) that takes a manifest and a base URL.
