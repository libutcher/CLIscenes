import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateAll, listSources } from "../src/node/generate.ts";
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
    expect(demos.map((d) => d.id)).toEqual(expect.arrayContaining(["cli-setup", "cli-signin"]));
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

    const setup: CompiledDemo = JSON.parse(await readFile(path.join(out, "demos/cli-setup/demo.json"), "utf8"));
    expect(setup.prerequisites?.length).toBeGreaterThan(0);
    expect(setup.steps.filter((s) => s.gate).map((s) => s.overlays[0]?.type)).toEqual(["settings-window", "settings-window"]);
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

  it("keeps same-named images apart, inside and outside the source folder", async () => {
    const root = await tempDir();
    const src = path.join(root, "demos");
    const out = await tempDir();
    for (const dir of ["demos/assets", "brand-a", "brand-b"]) await mkdir(path.join(root, dir), { recursive: true });
    await writeFile(path.join(src, "logo.svg"), "<svg>next to source</svg>");
    await writeFile(path.join(src, "assets/logo.svg"), "<svg>in assets</svg>");
    await writeFile(path.join(root, "brand-a/logo.svg"), "<svg>a</svg>");
    await writeFile(path.join(root, "brand-b/logo.svg"), "<svg>b</svg>");
    const prompt = (icon: string, requesterIcon: string) =>
      `{ type: auth-prompt, title: T, message: M, icon: ${icon}, requesterIcon: ${requesterIcon}, actions: [{ label: OK }] }`;
    await writeFile(
      path.join(src, "logos.yaml"),
      [
        "title: Logos",
        "steps:",
        "  - id: a",
        "    title: A",
        `    overlay: ${prompt("logo.svg", "assets/logo.svg")}`,
        "  - id: b",
        "    title: B",
        `    overlay: ${prompt("../brand-a/logo.svg", "../brand-b/logo.svg")}`,
      ].join("\n"),
    );

    await generateAll({ sourceDir: src, outDir: out });
    const dir = path.join(out, "demos/logos");
    const manifest: CompiledDemo = JSON.parse(await readFile(path.join(dir, "demo.json"), "utf8"));
    const srcs = manifest.steps.flatMap((s) => s.overlays).flatMap((o) => (o.type === "auth-prompt" ? [o.icon!, o.requesterIcon!] : []));
    expect(new Set(srcs).size).toBe(4);
    const contents = await Promise.all(srcs.map((s) => readFile(path.join(dir, s), "utf8")));
    expect(contents).toEqual(["<svg>next to source</svg>", "<svg>in assets</svg>", "<svg>a</svg>", "<svg>b</svg>"]);
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
