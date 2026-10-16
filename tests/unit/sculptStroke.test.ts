import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SculptStroke } from "@/lib/sculptStroke";

describe("asynchronous sculpt strokes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 16));
    vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("coalesces fast pointer input and drains the last dab before ending history", async () => {
    let complete!: () => void;
    const apply = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    const settled = vi.fn();
    const stroke = new SculptStroke<number>(apply, settled);
    stroke.push(1);
    await vi.advanceTimersByTimeAsync(16);
    for (let index = 2; index <= 1000; index += 1) stroke.push(index);
    stroke.finish();
    stroke.push(1001);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    complete();
    await vi.advanceTimersByTimeAsync(16);
    expect(apply.mock.calls).toEqual([[1], [1000]]);
    expect(settled).not.toHaveBeenCalled();
    complete();
    await vi.advanceTimersByTimeAsync(16);
    expect(settled).toHaveBeenCalledExactlyOnceWith();
  });

  it("cancels pending work when leaving sculpt mode", async () => {
    const apply = vi.fn(async () => {});
    const settled = vi.fn();
    const stroke = new SculptStroke<number>(apply, settled);
    stroke.push(1);
    stroke.cancel();
    await vi.runAllTimersAsync();
    expect(apply).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
  });

  it("does not resume a cancelled stroke after an in-flight worker returns", async () => {
    let complete!: () => void;
    const apply = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    const settled = vi.fn();
    const stroke = new SculptStroke<number>(apply, settled);
    stroke.push(1);
    await vi.advanceTimersByTimeAsync(16);
    stroke.push(2);
    stroke.cancel();
    complete();
    await vi.runAllTimersAsync();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
  });

  it("ends failed strokes once and discards their backlog", async () => {
    const error = new Error("worker failed");
    const apply = vi.fn(async () => { throw error; });
    const settled = vi.fn();
    const stroke = new SculptStroke<number>(apply, settled);
    stroke.push(1);
    await vi.runAllTimersAsync();
    stroke.push(2);
    stroke.finish();
    await vi.runAllTimersAsync();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledExactlyOnceWith(error);
  });
});
