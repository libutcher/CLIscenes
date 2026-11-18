import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { figmaFormat, parseFigmaLink } from "../src/core/figma.ts";
import { findFigmaImages, runFigmaCommand, syncFigmaImages } from "../src/node/figma.ts";

const temps: string[] = [];
async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "cliscenes-figma-"));
  temps.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const LINK = "https://www.figma.com/design/AbC123/Prompts?node-id=12-34&t=xyz";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="fingerprint"/></svg>';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function walkthrough(overlays: string[]) {
  return ["title: T", "steps:", ...overlays.map((o, i) => `  - id: s${i}\n    title: S\n    overlay: ${o}`)].join("\n");
}

/** A fake Figma API. Records requests so tests can check what was sent. */
function fakeFigma(files: Record<string, string | Buffer>, options: { status?: number; images?: Record<string, string | null> } = {}) {
  const requests: { url: string; headers?: HeadersInit }[] = [];
  const fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, headers: init?.headers });
    if (url.startsWith("https://api.figma.com/")) {
      if (options.status) return new Response("{}", { status: options.status });
      const ids = new URL(url).searchParams.get("ids")!.split(",");
      const images = options.images ?? Object.fromEntries(ids.map((id) => [id, `https://cdn.example/${encodeURIComponent(id)}`]));
      return Response.json({ err: null, images });
    }
    const id = decodeURIComponent(url.split("/").pop()!);
    const body = files[id]!;
    return new Response(typeof body === "string" ? body : new Uint8Array(body));
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

describe("Figma links", () => {
  it("reads design, file, proto, and branch links", () => {
    expect(parseFigmaLink(LINK)).toEqual({ fileKey: "AbC123", nodeId: "12:34" });
    expect(parseFigmaLink("https://figma.com/file/Key1/Name?node-id=1%3A2")).toEqual({ fileKey: "Key1", nodeId: "1:2" });
    expect(parseFigmaLink("https://www.figma.com/proto/Key1/Name?node-id=1-2")).toEqual({ fileKey: "Key1", nodeId: "1:2" });
    expect(parseFigmaLink("https://www.figma.com/design/Main1/branch/Br4nch/Name?node-id=5-6")).toEqual({ fileKey: "Br4nch", nodeId: "5:6" });
    expect(parseFigmaLink("https://www.figma.com/design/K/N?node-id=I1-2%3B3-4")).toEqual({ fileKey: "K", nodeId: "I1:2;3:4" });
  });

  it("rejects links that don't name one layer in a Figma file", () => {
    expect(parseFigmaLink("https://www.figma.com/design/AbC123/Prompts")).toBeUndefined();
    expect(parseFigmaLink("http://www.figma.com/design/K/N?node-id=1-2")).toBeUndefined();
    expect(parseFigmaLink("https://figma.com.evil.example/design/K/N?node-id=1-2")).toBeUndefined();
    expect(parseFigmaLink("https://www.figma.com/board/K/N?node-id=1-2")).toBeUndefined();
    expect(parseFigmaLink("not a link")).toBeUndefined();
  });

  it("maps image extensions to export formats", () => {
    expect(figmaFormat("a/b.SVG")).toBe("svg");
    expect(figmaFormat("b.jpeg")).toBe("jpg");
    expect(figmaFormat("b.webp")).toBeUndefined();
  });
});

describe("syncing from Figma", () => {
  it("downloads each linked frame into its src, without sending the token to the download host", async () => {
    const dir = await tempDir();
    await writeFile(
      path.join(dir, "a.yaml"),
      walkthrough([
        `{ type: image, src: assets/prompt.svg, alt: P, figma: "${LINK}" }`,
        `{ type: image, src: shot.png, alt: S, figma: "https://www.figma.com/design/AbC123/Prompts?node-id=7-8" }`,
        `{ type: image, src: assets/prompt.svg, alt: Again, figma: "${LINK}" }`,
        "{ type: image, src: local.png, alt: L }",
      ]),
    );
    const { fetch, requests } = fakeFigma({ "12:34": SVG, "7:8": PNG });

    const results = await syncFigmaImages({ sourceDir: dir, token: "secret", fetch });
    expect(results.map((r) => [r.src, r.status])).toEqual([
      ["assets/prompt.svg", "updated"],
      ["shot.png", "updated"],
    ]);
    expect(await readFile(path.join(dir, "assets/prompt.svg"), "utf8")).toBe(SVG);
    expect(await readFile(path.join(dir, "shot.png"))).toEqual(PNG);

    const api = requests.filter((r) => r.url.startsWith("https://api.figma.com/"));
    expect(api).toHaveLength(2);
    const svgParams = new URL(api.find((r) => r.url.includes("format=svg"))!.url).searchParams;
    expect(svgParams.get("svg_include_id")).toBe("true");
    expect(svgParams.get("svg_outline_text")).toBe("true");
    expect(api.every((r) => (r.headers as Record<string, string>)["X-Figma-Token"] === "secret")).toBe(true);
    expect(requests.filter((r) => r.url.startsWith("https://cdn.example/")).every((r) => r.headers === undefined)).toBe(true);

    const again = await syncFigmaImages({ sourceDir: dir, token: "secret", fetch });
    expect(again.map((r) => r.status)).toEqual(["unchanged", "unchanged"]);
  });

  it("explains a rejected token, a missing node, and a download that isn't the right format", async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, "a.yaml"), walkthrough([`{ type: image, src: p.svg, alt: P, figma: "${LINK}" }`]));
    await expect(syncFigmaImages({ sourceDir: dir, token: "t", fetch: fakeFigma({}, { status: 403 }).fetch })).rejects.toThrow(
      /refused the token/,
    );
    await expect(syncFigmaImages({ sourceDir: dir, token: "t", fetch: fakeFigma({}, { images: { "12:34": null } }).fetch })).rejects.toThrow(
      /couldn't render node 12:34/,
    );
    await expect(syncFigmaImages({ sourceDir: dir, token: "t", fetch: fakeFigma({ "12:34": "<html>" }).fetch })).rejects.toThrow(
      /isn't a SVG file/,
    );
  });

  it("won't write through a symlink that leaves the walkthrough's folder", async () => {
    const dir = await tempDir();
    const outside = await tempDir();
    await symlink(outside, path.join(dir, "assets"));
    await writeFile(path.join(dir, "a.yaml"), walkthrough([`{ type: image, src: assets/p.svg, alt: P, figma: "${LINK}" }`]));
    await expect(syncFigmaImages({ sourceDir: dir, token: "t", fetch: fakeFigma({ "12:34": SVG }).fetch })).rejects.toThrow(
      /outside the walkthrough's folder/,
    );
    await expect(lstat(path.join(outside, "p.svg"))).rejects.toThrow();
  });

  it("lists links without a token in a dry run, and asks for a token otherwise", async () => {
    const dir = await tempDir();
    await mkdir(path.join(dir, "assets"));
    await writeFile(path.join(dir, "a.yaml"), walkthrough([`{ type: image, src: assets/p.svg, alt: P, figma: "${LINK}" }`]));
    expect(await findFigmaImages(dir)).toHaveLength(1);
    const lines = await runFigmaCommand(dir, { dryRun: true, env: {} });
    expect(lines[0]).toMatch(/would download .*p\.svg .*file AbC123, node 12:34/);
    await expect(runFigmaCommand(dir, { env: {} })).rejects.toThrow(/Set FIGMA_TOKEN/);
  });
});

describe("click areas from Figma layers", () => {
  // A 200×100 frame at (1000, 500) on the canvas, with a 10px shadow on each side.
  const frame = {
    id: "12:34",
    name: "Prompt",
    absoluteBoundingBox: { x: 1000, y: 500, width: 200, height: 100 },
    absoluteRenderBounds: { x: 990, y: 490, width: 220, height: 120 },
    children: [
      { id: "1:1", name: "Buttons", children: [{ id: "1:2", name: "Approve", absoluteBoundingBox: { x: 1150, y: 570, width: 40, height: 20 } }] },
      { id: "1:3", name: "Cancel", absoluteBoundingBox: { x: 1010, y: 570, width: 40, height: 20 } },
    ],
  };
  const svg = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"></svg>`;

  function fakeFigmaWithNodes(image: string, node: object = frame) {
    const base = fakeFigma({ "12:34": image });
    const fetch = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes("/v1/files/")) {
        base.requests.push({ url: String(input), headers: init?.headers });
        return Response.json({ err: null, nodes: { "12:34": { document: node } } });
      }
      return base.fetch(input, init);
    }) as typeof globalThis.fetch;
    return { fetch, requests: base.requests };
  }

  async function setup(actions: string) {
    const dir = await tempDir();
    await writeFile(
      path.join(dir, "a.yaml"),
      walkthrough([`{ type: image, src: p.svg, alt: P, figma: "${LINK}", actions: [${actions}] }`]),
    );
    return dir;
  }

  it("saves each named layer's position, measured from the frame's corner", async () => {
    const dir = await setup("{ label: Approve, layer: Approve }, { label: Cancel, layer: Cancel, next: s0 }");
    const { fetch, requests } = fakeFigmaWithNodes(svg(200, 100));
    await syncFigmaImages({ sourceDir: dir, token: "t", fetch });
    expect(JSON.parse(await readFile(path.join(dir, "p.layers.json"), "utf8"))).toEqual({
      width: 200,
      height: 100,
      layers: { Approve: { x: 150, y: 70, width: 40, height: 20 }, Cancel: { x: 10, y: 70, width: 40, height: 20 } },
    });
    expect(requests.some((r) => r.url.includes("/v1/files/AbC123/nodes?ids=12%3A34"))).toBe(true);
  });

  it("measures from the shadow's edge when the export includes it", async () => {
    const dir = await setup("{ label: Approve, layer: Approve }");
    await syncFigmaImages({ sourceDir: dir, token: "t", fetch: fakeFigmaWithNodes(svg(220, 120)).fetch });
    const positions = JSON.parse(await readFile(path.join(dir, "p.layers.json"), "utf8"));
    expect(positions.layers.Approve).toEqual({ x: 160, y: 80, width: 40, height: 20 });
  });

  it("stops when the export doesn't match the frame, or a layer is missing or ambiguous", async () => {
    const dir = await setup("{ label: Approve, layer: Approve }");
    await expect(syncFigmaImages({ sourceDir: dir, token: "t", fetch: fakeFigmaWithNodes(svg(300, 300)).fetch })).rejects.toThrow(
      /doesn't match the frame's size/,
    );

    const missing = await setup("{ label: OK, layer: OK }");
    await expect(syncFigmaImages({ sourceDir: missing, token: "t", fetch: fakeFigmaWithNodes(svg(200, 100)).fetch })).rejects.toThrow(
      /no layer named "OK"/,
    );

    const twice = { ...frame, children: [...frame.children, { id: "1:9", name: "Approve", absoluteBoundingBox: { x: 0, y: 0, width: 1, height: 1 } }] };
    await expect(syncFigmaImages({ sourceDir: dir, token: "t", fetch: fakeFigmaWithNodes(svg(200, 100), twice).fetch })).rejects.toThrow(
      /2 layers are named "Approve"/,
    );
  });

  it("reads the size of a 2× PNG export", async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, "a.yaml"), walkthrough([`{ type: image, src: p.png, alt: P, figma: "${LINK}", actions: [{ label: A, layer: Approve }] }`]));
    const png = Buffer.alloc(24);
    PNG.copy(png, 0, 0, 8);
    png.writeUInt32BE(400, 16);
    png.writeUInt32BE(200, 20);
    await syncFigmaImages({ sourceDir: dir, token: "t", fetch: fakeFigmaWithNodes(png as unknown as string).fetch });
    expect(JSON.parse(await readFile(path.join(dir, "p.layers.json"), "utf8")).width).toBe(200);
  });
});
