import { afterEach, describe, expect, it, vi } from "vitest";
import { copySculptNumbers } from "@/lib/sculptTransfer";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("sculpt mesh transfer", () => {
  it("preserves double precision through project-array and transfer-buffer conversion", async () => {
    const source = [Math.PI, 1e-12, -123456789.12345679];
    const packed = await copySculptNumbers(source, new Float64Array(source.length));
    const unpacked = await copySculptNumbers(packed!, new Array<number>(source.length));
    expect(unpacked).toEqual(source);
  });

  it("yields to UI events and cancels a superseded large copy", async () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now += 5);
    let cancelled = false;
    const source = new Float64Array(100_000).fill(3);
    const target = new Array<number>(source.length);
    const result = copySculptNumbers(source, target, () => cancelled);
    expect(target[0]).toBe(3);
    expect(target[20_000]).toBeUndefined();
    cancelled = true;
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBeNull();
    expect(target[20_000]).toBeUndefined();
  });
});
