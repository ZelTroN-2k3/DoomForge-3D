import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcDir = join(rootDir, "apps", "web", "src");
const workersDir = join(srcDir, "workers");

function readWorker(name: string) {
  return readFileSync(join(workersDir, name), "utf-8");
}

function readSrc(relPath: string) {
  return readFileSync(join(srcDir, relPath), "utf-8");
}

describe("OCCT worker loading paths", () => {
  it("sketchCad worker loads from /occt/ (matches copy-occt-wasm.mjs output)", () => {
    const source = readWorker("sketchCad.worker.ts");
    expect(source).toContain("/occt/occt-wasm.js");
    expect(source).toContain("/occt/occt-wasm.wasm");
    expect(source).not.toContain("/assets/occt/");
  });

  it("cadModifier worker uses CAD_MODIFIER_RUNTIME_BASE for /occt/ path", () => {
    const source = readWorker("cadModifier.worker.ts");
    expect(source).toContain("CAD_MODIFIER_RUNTIME_BASE");
    expect(source).not.toContain("/assets/occt/");
    const runtimeSource = readSrc("lib/cadModifierRuntime.ts");
    expect(runtimeSource).toContain('"/occt"');
  });

  it("brepKernel loads from /occt/ (consistent with workers)", () => {
    const source = readSrc("lib/brepKernel.ts");
    expect(source).toContain("/occt/index.js");
    expect(source).toContain("/occt/occt-wasm.wasm");
    expect(source).not.toContain("/assets/occt/");
  });
});
