import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateAll } from "../src/node/generate.ts";
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

describe("generator", () => {
  it("validates every example in demos/", async () => {
    const demos = await generateAll({ sourceDir: repoDemos, outDir: "unused", check: true });
    expect(demos.map((d) => d.id)).toEqual(["cli-setup", "cli-signin"]);
  });

  it("writes a cast, manifest, assets, and index for each demo", async () => {
    const out = await tempDir();
    await generateAll({ sourceDir: repoDemos, outDir: out });

    const index: DemoIndexEntry[] = JSON.parse(await readFile(path.join(out, "demos/index.json"), "utf8"));
    expect(index.map((d) => d.id)).toEqual(["cli-setup", "cli-signin"]);

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
