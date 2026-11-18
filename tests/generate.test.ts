import { mkdtemp, readFile, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateAll, listSources, OUTPUT_MARKER } from "../src/node/generate.ts";
import { parseCast } from "../src/core/asciicast.ts";
import type { CompiledDemo, DemoIndexEntry } from "../src/core/types.ts";

const repoDemos = path.resolve(import.meta.dirname, "../demos");
const temps: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "cliscenes-test-"));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** Ids of every source file in demos/, so adding a walkthrough never breaks these tests. */
async function repoDemoIds() {
  return (await listSources(repoDemos)).map((file) => path.basename(file, path.extname(file)));
}

describe("generator", () => {
  it("validates every walkthrough in demos/, including the built-in examples", async () => {
    const demos = await generateAll({ sourceDir: repoDemos, outDir: "unused", check: true });
    expect(demos.map((d) => d.id)).toEqual(await repoDemoIds());
    expect(demos.map((d) => d.id)).toEqual(expect.arrayContaining(["cli-signin"]));
  });

  it("writes a cast, manifest, assets, and index for each demo", async () => {
    const out = await tempDir();
    await generateAll({ sourceDir: repoDemos, outDir: out });

    const index: DemoIndexEntry[] = JSON.parse(await readFile(path.join(out, "demos/index.json"), "utf8"));
    expect(index.map((d) => d.id)).toEqual(await repoDemoIds());

    const dir = path.join(out, "demos/cli-signin");
    const manifest: CompiledDemo = JSON.parse(await readFile(path.join(dir, "demo.json"), "utf8"));
    const cast = parseCast(await readFile(path.join(dir, "demo.cast"), "utf8"));
    expect(manifest.cast).toBe("demo.cast");
    expect(cast.duration).toBeCloseTo(manifest.duration, 2);

    const prompt = manifest.steps.flatMap((s) => s.overlays).find((o) => o.type === "auth-prompt");
    expect(prompt).toMatchObject({ icon: "assets/yourapp-icon.svg" });
    await expect(readFile(path.join(dir, "assets/yourapp-icon.svg"))).resolves.toBeTruthy();

  });

  it("copies auth-prompt icons and keeps same-named images in different folders apart", async () => {
    const src = await tempDir();
    const out = await tempDir();
    await mkdir(path.join(src, "assets/a"), { recursive: true });
    await mkdir(path.join(src, "assets/b"), { recursive: true });
    await writeFile(path.join(src, "assets/a/logo.svg"), "<svg>a</svg>");
    await writeFile(path.join(src, "assets/b/logo.svg"), "<svg>b</svg>");
    await writeFile(
      path.join(src, "icons.yaml"),
      [
        "title: Icons",
        "steps:",
        "  - id: a",
        "    title: A",
        "    overlay: { type: auth-prompt, title: T, message: M, icon: assets/a/logo.svg, requesterIcon: assets/b/logo.svg, actions: [{ label: OK }] }",
        "  - id: b",
        "    title: B",
        "    overlay: { type: image, src: assets/a/logo.svg, alt: Logo }",
      ].join("\n"),
    );

    await generateAll({ sourceDir: src, outDir: out });
    const dir = path.join(out, "demos/icons");
    const manifest: CompiledDemo = JSON.parse(await readFile(path.join(dir, "demo.json"), "utf8"));
    expect(manifest.steps[0]!.overlays[0]).toMatchObject({ icon: "assets/a/logo.svg", requesterIcon: "assets/b/logo.svg" });
    expect(await readFile(path.join(dir, "assets/a/logo.svg"), "utf8")).toBe("<svg>a</svg>");
    expect(await readFile(path.join(dir, "assets/b/logo.svg"), "utf8")).toBe("<svg>b</svg>");
  });

  it("keeps same-named images apart when one sits next to the source and one in assets/", async () => {
    const src = await tempDir();
    const out = await tempDir();
    await mkdir(path.join(src, "assets"), { recursive: true });
    await writeFile(path.join(src, "logo.svg"), "<svg>next to source</svg>");
    await writeFile(path.join(src, "assets/logo.svg"), "<svg>in assets</svg>");
    await writeFile(
      path.join(src, "logos.yaml"),
      "title: Logos\nsteps:\n  - id: a\n    title: A\n    overlay: { type: auth-prompt, title: T, message: M, icon: logo.svg, requesterIcon: assets/logo.svg, actions: [{ label: OK }] }\n",
    );
    await generateAll({ sourceDir: src, outDir: out });
    const dir = path.join(out, "demos/logos");
    const manifest: CompiledDemo = JSON.parse(await readFile(path.join(dir, "demo.json"), "utf8"));
    const prompt = manifest.steps[0]!.overlays[0] as { icon: string; requesterIcon: string };
    expect(prompt.icon).not.toBe(prompt.requesterIcon);
    expect(await readFile(path.join(dir, prompt.icon), "utf8")).toBe("<svg>next to source</svg>");
    expect(await readFile(path.join(dir, prompt.requesterIcon), "utf8")).toBe("<svg>in assets</svg>");
  });

  describe("asset safety", () => {
    const withIcon = (icon: string) =>
      `title: X\nsteps:\n  - id: a\n    title: A\n    overlay: { type: auth-prompt, title: T, message: M, icon: "${icon}", actions: [{ label: OK }] }\n`;

    it("rejects paths that leave the walkthrough's folder", async () => {
      const root = await tempDir();
      const src = path.join(root, "demos");
      await mkdir(src);
      await writeFile(path.join(root, "secret.png"), "not for publishing");
      await writeFile(path.join(src, "x.yaml"), withIcon("../secret.png"));
      await expect(generateAll({ sourceDir: src, outDir: root, check: true })).rejects.toThrow(/can't use "\.\."/);
      await writeFile(path.join(src, "x.yaml"), withIcon(path.join(root, "secret.png")));
      await expect(generateAll({ sourceDir: src, outDir: root, check: true })).rejects.toThrow(/absolute paths/);
    });

    it("rejects a symlink that points outside the walkthrough's folder", async () => {
      const root = await tempDir();
      const src = path.join(root, "demos");
      const out = path.join(root, "out");
      await mkdir(src);
      await writeFile(path.join(root, "secret.png"), "not for publishing");
      await symlink(path.join(root, "secret.png"), path.join(src, "innocent.png"));
      await writeFile(path.join(src, "x.yaml"), withIcon("innocent.png"));
      await expect(generateAll({ sourceDir: src, outDir: out })).rejects.toThrow(/links to a file outside/);
      await expect(readFile(path.join(out, "demos/x/assets/innocent.png"))).rejects.toThrow();
    });

    it("rejects files that aren't images", async () => {
      const src = await tempDir();
      await writeFile(path.join(src, ".env"), "TOKEN=abc");
      await writeFile(path.join(src, "x.yaml"), withIcon(".env"));
      await expect(generateAll({ sourceDir: src, outDir: src, check: true })).rejects.toThrow(/Not an image file: \.env/);
    });
  });

  describe("flat output (cliscenes build)", () => {
    const source = "title: X\nsteps:\n  - id: a\n    title: A\n    terminal: { output: hi }\n";

    it("writes walkthroughs straight into the folder and marks it", async () => {
      const src = await tempDir();
      const out = path.join(await tempDir(), "walkthroughs");
      await writeFile(path.join(src, "demo-a.yaml"), source);
      await generateAll({ sourceDir: src, outDir: out, flat: true });
      await expect(readFile(path.join(out, "demo-a/demo.json"), "utf8")).resolves.toContain('"id": "demo-a"');
      await expect(readFile(path.join(out, "index.json"), "utf8")).resolves.toContain("demo-a");
      await expect(readFile(path.join(out, OUTPUT_MARKER), "utf8")).resolves.toBeTruthy();
    });

    it("replaces a folder it made before, removing walkthroughs that no longer exist", async () => {
      const src = await tempDir();
      const out = await tempDir();
      await writeFile(path.join(src, "old.yaml"), source);
      await generateAll({ sourceDir: src, outDir: out, flat: true });
      await rm(path.join(src, "old.yaml"));
      await writeFile(path.join(src, "new.yaml"), source);
      await generateAll({ sourceDir: src, outDir: out, flat: true });
      await expect(readFile(path.join(out, "new/demo.json"))).resolves.toBeTruthy();
      await expect(readFile(path.join(out, "old/demo.json"))).rejects.toThrow();
    });

    it("refuses to replace a folder with other files in it", async () => {
      const src = await tempDir();
      const out = await tempDir();
      await writeFile(path.join(src, "a.yaml"), source);
      await writeFile(path.join(out, "favicon.ico"), "keep me");
      await expect(generateAll({ sourceDir: src, outDir: out, flat: true })).rejects.toThrow(/isn't empty/);
      await expect(readFile(path.join(out, "favicon.ico"), "utf8")).resolves.toBe("keep me");
    });
  });

  it("reports a missing icon", async () => {
    const src = await tempDir();
    await writeFile(
      path.join(src, "x.yaml"),
      "title: X\nsteps:\n  - id: a\n    title: A\n    overlay: { type: auth-prompt, title: T, message: M, icon: nope.svg, actions: [{ label: OK }] }\n",
    );
    await expect(generateAll({ sourceDir: src, outDir: src, check: true })).rejects.toThrow(/Image not found: nope\.svg/);
  });

  it("reports problems from every file and writes nothing", async () => {
    const src = await tempDir();
    const out = await tempDir();
    await writeFile(path.join(src, "good.yaml"), "title: OK\nsteps:\n  - id: a\n    title: A\n    terminal: { output: hi }\n");
    await writeFile(path.join(src, "bad-ref.yaml"), "title: Bad\nsteps:\n  - id: a\n    title: A\n    overlay: { type: auth-prompt, title: T, message: M, actions: [{ label: Go, next: missing }] }\n");
    await writeFile(path.join(src, "bad-image.yaml"), "title: Bad\nsteps:\n  - id: a\n    title: A\n    overlay: { type: image, src: nope.png, alt: x }\n");

    const error = (await generateAll({ sourceDir: src, outDir: out }).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.message).toMatch(/bad-ref\.yaml[\s\S]*Unknown step "missing"/);
    expect(error.message).toMatch(/bad-image\.yaml[\s\S]*Image not found: nope\.png/);
    await expect(readFile(path.join(out, "demos/index.json"))).rejects.toThrow();
  });

  it("rejects file names that can't be demo ids", async () => {
    const src = await tempDir();
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, "My Demo.yaml"), "title: X\nsteps:\n  - id: a\n    title: A\n    terminal: { output: hi }\n");
    await expect(generateAll({ sourceDir: src, outDir: src, check: true })).rejects.toThrow(/demo id/);
  });

  it("fails clearly when there are no sources", async () => {
    const src = await tempDir();
    await expect(generateAll({ sourceDir: src, outDir: src })).rejects.toThrow(/No \.yaml/);
  });
});

describe("animated images", () => {
  const svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect id="dot"/></svg>';
  const css = "#dot { animation: fade 1s; }\n@media (prefers-reduced-motion: no-preference) { #dot { animation: spin 1s; } }";

  it("builds the CSS into the SVG, makes a reduced-motion copy, and doesn't publish the Figma link", async () => {
    const src = await tempDir();
    const out = await tempDir();
    await mkdir(path.join(src, "assets"));
    await writeFile(path.join(src, "assets/p.svg"), svg);
    await writeFile(path.join(src, "assets/p.css"), css);
    await writeFile(
      path.join(src, "anim.yaml"),
      [
        "title: Anim",
        "steps:",
        "  - id: a",
        "    title: A",
        "    overlay:",
        "      type: image",
        "      src: assets/p.svg",
        "      animation: assets/p.css",
        "      frame: false",
        "      alt: A prompt",
        '      figma: "https://www.figma.com/design/Internal1/Secret?node-id=1-2"',
        "  - id: b",
        "    title: B",
        "    overlay: { type: image, src: assets/p.svg, alt: Still }",
      ].join("\n"),
    );

    await generateAll({ sourceDir: src, outDir: out });
    const dir = path.join(out, "demos/anim");
    const json = await readFile(path.join(dir, "demo.json"), "utf8");
    expect(json).not.toMatch(/figma|Internal1|p\.css/);
    const manifest: CompiledDemo = JSON.parse(json);
    const [animated, still] = manifest.steps.map((s) => s.overlays[0]!);
    expect(animated).toMatchObject({ src: "assets/p.svg", srcReducedMotion: "assets/p.reduced-motion.svg", frame: false });
    expect(still).toMatchObject({ frame: true });
    expect(still).not.toHaveProperty("srcReducedMotion");

    const built = await readFile(path.join(dir, "assets/p.svg"), "utf8");
    expect(built).toContain('height="10">\n<style><![CDATA[\n#dot');
    expect(built).toContain("(prefers-reduced-motion: no-preference)");
    const reduced = await readFile(path.join(dir, "assets/p.reduced-motion.svg"), "utf8");
    expect(reduced).toContain("@media (max-width: 0px)");
    // The plain image is a separate, unchanged copy.
    const plain = (still as { src: string }).src;
    expect(plain).not.toBe("assets/p.svg");
    expect(await readFile(path.join(dir, plain), "utf8")).toBe(svg);
  });

  it("reports an animation on a file that isn't an SVG, and CSS that can't go inside one", async () => {
    const src = await tempDir();
    await writeFile(path.join(src, "p.svg"), "not svg");
    await writeFile(path.join(src, "ok.svg"), svg);
    await writeFile(path.join(src, "bad.css"), "a { content: ']]>' }");
    await writeFile(path.join(src, "p.css"), css);
    const demo = (overlay: string) => `title: T\nsteps:\n  - id: a\n    title: A\n    overlay: ${overlay}\n`;
    await writeFile(path.join(src, "one.yaml"), demo("{ type: image, src: p.svg, animation: p.css, alt: x }"));
    await writeFile(path.join(src, "two.yaml"), demo("{ type: image, src: ok.svg, animation: bad.css, alt: x }"));
    await writeFile(path.join(src, "three.yaml"), demo("{ type: image, src: ok.svg, animation: missing.css, alt: x }"));
    const error = (await generateAll({ sourceDir: src, outDir: src, check: true }).catch((e: unknown) => e)) as Error;
    expect(error.message).toMatch(/one\.yaml[\s\S]*Could not add animation to p\.svg: the file doesn't contain an <svg> element/);
    expect(error.message).toMatch(/two\.yaml[\s\S]*"\]\]>"/);
    expect(error.message).toMatch(/three\.yaml[\s\S]*File not found: missing\.css/);
  });
});

describe("forceReducedMotion", () => {
  it("answers every prefers-reduced-motion query as reduce, keeping not and and", async () => {
    const { forceReducedMotion } = await import("../src/node/generate.ts");
    expect(forceReducedMotion("@media (prefers-reduced-motion: no-preference) {}")).toBe("@media (max-width: 0px) {}");
    expect(forceReducedMotion("@media (prefers-reduced-motion:reduce) {}")).toBe("@media (min-width: 0px) {}");
    expect(forceReducedMotion("@media (prefers-reduced-motion) {}")).toBe("@media (min-width: 0px) {}");
    expect(forceReducedMotion("@media not all and (prefers-reduced-motion: no-preference) {}")).toBe(
      "@media not all and (max-width: 0px) {}",
    );
  });
});

describe("image click areas", () => {
  const demo = (overlay: string) => `title: T\nsteps:\n  - id: a\n    title: A\n    overlay: ${overlay}\n    waitForAction: true\n  - id: b\n    title: B\n    terminal: { output: done }\n`;
  const link = "https://www.figma.com/design/K1/N?node-id=1-2";

  it("turns Figma layer names into areas, and publishes neither the layer names nor the link", async () => {
    const src = await tempDir();
    const out = await tempDir();
    await writeFile(path.join(src, "p.svg"), "<svg/>");
    await writeFile(
      path.join(src, "p.layers.json"),
      JSON.stringify({ width: 200, height: 100, layers: { Approve: { x: 150, y: 70, width: 40, height: 20 } } }),
    );
    await writeFile(path.join(src, "a.yaml"), demo(`{ type: image, src: p.svg, alt: P, figma: "${link}", actions: [{ label: Approve, layer: Approve }] }`));
    await generateAll({ sourceDir: src, outDir: out });
    const json = await readFile(path.join(out, "demos/a/demo.json"), "utf8");
    expect(json).not.toMatch(/layer|K1/);
    const manifest: CompiledDemo = JSON.parse(json);
    expect(manifest.steps[0]!.gate).toBeDefined();
    expect(manifest.steps[0]!.overlays[0]).toMatchObject({ actions: [{ label: "Approve", area: { x: 75, y: 70, width: 20, height: 20 } }] });
  });

  it("places layers from a positions file written by hand, with no figma link", async () => {
    const src = await tempDir();
    const out = await tempDir();
    await writeFile(path.join(src, "p.svg"), "<svg/>");
    await writeFile(
      path.join(src, "p.layers.json"),
      JSON.stringify({ width: 200, height: 100, layers: { Approve: { x: 150, y: 70, width: 40, height: 20 } } }),
    );
    await writeFile(path.join(src, "a.yaml"), demo(`{ type: image, src: p.svg, alt: P, actions: [{ label: Approve, layer: Approve }] }`));
    await generateAll({ sourceDir: src, outDir: out });
    const manifest: CompiledDemo = JSON.parse(await readFile(path.join(out, "demos/a/demo.json"), "utf8"));
    expect(manifest.steps[0]!.overlays[0]).toMatchObject({ actions: [{ label: "Approve", area: { x: 75, y: 70, width: 20, height: 20 } }] });
  });

  it("refuses a positions file with a mistyped box instead of building a button with no size", async () => {
    const src = await tempDir();
    await writeFile(path.join(src, "p.svg"), "<svg/>");
    await writeFile(path.join(src, "a.yaml"), demo(`{ type: image, src: p.svg, alt: P, actions: [{ label: A, layer: Approve }] }`));
    // `w`/`h` instead of `width`/`height`, the easiest slip to make by hand.
    await writeFile(path.join(src, "p.layers.json"), JSON.stringify({ width: 200, height: 100, layers: { Approve: { x: 1, y: 1, w: 2, h: 2 } } }));
    const error = (await generateAll({ sourceDir: src, outDir: src, check: true }).catch((e: unknown) => e)) as Error;
    expect(error.message).toMatch(/isn't a layer positions file/);
  });

  it("refuses a box that doesn't fit on the image", async () => {
    const src = await tempDir();
    await writeFile(path.join(src, "p.svg"), "<svg/>");
    await writeFile(path.join(src, "a.yaml"), demo(`{ type: image, src: p.svg, alt: P, actions: [{ label: A, layer: Approve }] }`));
    await writeFile(
      path.join(src, "p.layers.json"),
      JSON.stringify({ width: 200, height: 100, layers: { Approve: { x: 180, y: 10, width: 40, height: 20 } } }),
    );
    const error = (await generateAll({ sourceDir: src, outDir: src, check: true }).catch((e: unknown) => e)) as Error;
    expect(error.message).toMatch(/Layer "Approve" in p\.layers\.json isn't a usable click area: .*runs off the edge/);
  });

  it("asks for a Figma sync when positions are missing, and names a missing layer", async () => {
    const src = await tempDir();
    await writeFile(path.join(src, "p.svg"), "<svg/>");
    await writeFile(path.join(src, "a.yaml"), demo(`{ type: image, src: p.svg, alt: P, figma: "${link}", actions: [{ label: A, layer: Approve }] }`));
    const error = (await generateAll({ sourceDir: src, outDir: src, check: true }).catch((e: unknown) => e)) as Error;
    expect(error.message).toMatch(/No click-area positions for p\.svg \(p\.layers\.json\)\. Run cliscenes figma/);

    await writeFile(path.join(src, "p.layers.json"), JSON.stringify({ width: 1, height: 1, layers: {} }));
    const again = (await generateAll({ sourceDir: src, outDir: src, check: true }).catch((e: unknown) => e)) as Error;
    expect(again.message).toMatch(/No layer named "Approve" in p\.layers\.json/);
  });
});
