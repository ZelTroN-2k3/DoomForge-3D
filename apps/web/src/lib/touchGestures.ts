export type TouchPoint = { id: number; x: number; y: number };
export type TouchNavigation = {
  kind: "orbit" | "pan-zoom";
  dx: number;
  dy: number;
  scale: number;
  center: { x: number; y: number };
};
export type TouchAction =
  | { type: "start" | "move" | "end" | "tap" | "cancel"; point: TouchPoint }
  | { type: "navigate"; navigation: TouchNavigation }
  | { type: "idle" };

/** A second finger always owns navigation until every finger has lifted. */
export class TouchGestureController {
  private pointers = new Map<number, TouchPoint>();
  private origin: TouchPoint | null = null;
  private mode: "pending" | "edit" | "navigate" = "pending";
  private singleAction: "edit" | "navigate" = "edit";
  private multiTouch = false;

  has(id: number) { return this.pointers.has(id); }

  down(point: TouchPoint, singleAction: "edit" | "navigate"): TouchAction[] {
    if (this.has(point.id)) return [];
    const actions: TouchAction[] = [];
    if (this.pointers.size === 0) {
      this.origin = point;
      this.singleAction = singleAction;
      this.mode = "pending";
      this.multiTouch = false;
    } else {
      if (this.mode === "edit" && this.origin) actions.push({ type: "cancel", point: this.pointers.get(this.origin.id) ?? this.origin });
      this.mode = "navigate";
      this.multiTouch = true;
    }
    this.pointers.set(point.id, point);
    return actions;
  }

  move(point: TouchPoint): TouchAction[] {
    const previous = this.pointers.get(point.id);
    if (!previous || !this.origin) return [];
    const before = [...this.pointers.values()].slice(0, 2);
    this.pointers.set(point.id, point);
    const actions: TouchAction[] = [];
    if (this.mode === "pending") {
      if (Math.hypot(point.x - this.origin.x, point.y - this.origin.y) < 8) return [];
      this.mode = this.singleAction;
      if (this.mode === "edit") actions.push({ type: "start", point: this.origin });
    }
    if (this.mode === "edit") return [...actions, { type: "move", point }];
    if (this.multiTouch) {
      if (this.pointers.size < 2 || !before.some((entry) => entry.id === point.id)) return [];
      const after = [...this.pointers.values()].slice(0, 2);
      const center = (points: TouchPoint[]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
      const oldCenter = center(before);
      const newCenter = center(after);
      const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
      const distance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
      return [{ type: "navigate", navigation: {
        kind: "pan-zoom", dx: newCenter.x - oldCenter.x, dy: newCenter.y - oldCenter.y,
        scale: oldDistance > 2 && distance > 2 ? Math.max(0.5, Math.min(2, distance / oldDistance)) : 1,
        center: newCenter,
      } }];
    }
    return [{ type: "navigate", navigation: { kind: "orbit", dx: point.x - previous.x, dy: point.y - previous.y, scale: 1, center: point } }];
  }

  up(point: TouchPoint): TouchAction[] {
    if (!this.has(point.id)) return [];
    const actions: TouchAction[] = [];
    if (this.mode === "pending" && !this.multiTouch) actions.push({ type: "tap", point });
    if (this.mode === "edit") actions.push({ type: "end", point });
    this.pointers.delete(point.id);
    if (this.pointers.size === 0) {
      this.origin = null;
      this.mode = "pending";
      actions.push({ type: "idle" });
    }
    return actions;
  }

  cancel(): TouchAction[] {
    const actions: TouchAction[] = this.mode === "edit" && this.origin
      ? [{ type: "cancel", point: this.pointers.get(this.origin.id) ?? this.origin }]
      : [];
    this.pointers.clear();
    this.origin = null;
    this.mode = "pending";
    this.multiTouch = false;
    return [...actions, { type: "idle" }];
  }
}
