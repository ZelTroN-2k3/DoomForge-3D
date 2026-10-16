import { describe, expect, it } from "vitest";
import { TouchGestureController } from "@/lib/touchGestures";

const point = (id: number, x: number, y = 100) => ({ id, x, y });

describe("touch gesture arbitration", () => {
  it("defers a tap until release so the first finger of a pinch does not edit", () => {
    const gestures = new TouchGestureController();
    expect(gestures.down(point(1, 100), "edit")).toEqual([]);
    expect(gestures.move(point(1, 103))).toEqual([]);
    expect(gestures.up(point(1, 103))).toEqual([{ type: "tap", point: point(1, 103) }, { type: "idle" }]);
  });

  it("starts an edit at the original contact after passing the drag threshold", () => {
    const gestures = new TouchGestureController();
    gestures.down(point(1, 100), "edit");
    expect(gestures.move(point(1, 120))).toEqual([
      { type: "start", point: point(1, 100) }, { type: "move", point: point(1, 120) },
    ]);
    expect(gestures.move(point(1, 140))).toEqual([{ type: "move", point: point(1, 140) }]);
    expect(gestures.up(point(1, 140))).toEqual([{ type: "end", point: point(1, 140) }, { type: "idle" }]);
  });

  it("orbits with a single navigation finger without creating edit events", () => {
    const gestures = new TouchGestureController();
    gestures.down(point(1, 100), "navigate");
    expect(gestures.move(point(1, 120))).toEqual([{ type: "navigate", navigation: { kind: "orbit", dx: 20, dy: 0, scale: 1, center: point(1, 120) } }]);
    expect(gestures.up(point(1, 120))).toEqual([{ type: "idle" }]);
  });

  it.each([1, 2])("keeps navigation ownership when finger %i lifts first", (firstToLift) => {
    const gestures = new TouchGestureController();
    gestures.down(point(1, 100), "edit");
    gestures.down(point(2, 200), "edit");
    expect(gestures.move(point(2, 240))).toEqual([{ type: "navigate", navigation: { kind: "pan-zoom", dx: 20, dy: 0, scale: 1.4, center: { x: 170, y: 100 } } }]);
    expect(gestures.up(point(firstToLift, 150))).toEqual([]);
    const remaining = firstToLift === 1 ? 2 : 1;
    expect(gestures.move(point(remaining, 160))).toEqual([]);
    expect(gestures.up(point(remaining, 160))).toEqual([{ type: "idle" }]);
    gestures.down(point(3, 100), "edit");
    expect(gestures.up(point(3, 100))[0].type).toBe("tap");
  });

  it("cancels an edit before handing control to two-finger navigation", () => {
    const gestures = new TouchGestureController();
    gestures.down(point(1, 100), "edit");
    gestures.move(point(1, 120));
    expect(gestures.down(point(2, 200), "edit")).toEqual([{ type: "cancel", point: point(1, 120) }]);
    expect(gestures.move(point(2, 220))[0].type).toBe("navigate");
  });

  it("ignores extra fingers without changing the zoom baseline", () => {
    const gestures = new TouchGestureController();
    gestures.down(point(1, 100), "navigate");
    gestures.down(point(2, 200), "navigate");
    gestures.down(point(3, 250), "navigate");
    expect(gestures.move(point(3, 500))).toEqual([]);
    expect(gestures.move(point(2, 210))[0]).toMatchObject({ type: "navigate", navigation: { scale: 1.1 } });
  });

  it("clears editing and ignores late events after cancellation", () => {
    const gestures = new TouchGestureController();
    gestures.down(point(1, 100), "edit");
    gestures.move(point(1, 120));
    expect(gestures.cancel()).toEqual([{ type: "cancel", point: point(1, 120) }, { type: "idle" }]);
    expect(gestures.move(point(1, 150))).toEqual([]);
    expect(gestures.up(point(1, 150))).toEqual([]);
    expect(gestures.has(1)).toBe(false);
  });

  it("does not divide by zero when fingers overlap", () => {
    const gestures = new TouchGestureController();
    gestures.down(point(1, 100), "edit");
    gestures.down(point(2, 100), "edit");
    expect(gestures.move(point(2, 130))[0]).toMatchObject({ type: "navigate", navigation: { scale: 1 } });
  });
});
