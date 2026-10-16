"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { TouchGestureController, type TouchAction, type TouchNavigation } from "@/lib/touchGestures";

type TouchOptions = {
  resetKey: string;
  singleAction: (event: PointerEvent) => "edit" | "navigate";
  allowTap: boolean;
  additive?: boolean;
  blocked?: () => boolean;
  navigate: (navigation: TouchNavigation) => void;
  idle?: () => void;
};

/** Delay editing until intent is known, then reuse the existing pointer tools.
 * The original target is retained so SVG point/handle tools keep their behavior.
 * Replay events are explicitly marked and never re-enter gesture recognition.
 */
export function useTouchNavigation(ref: RefObject<HTMLElement | SVGSVGElement | null>, options: TouchOptions) {
  const latest = useRef(options);
  latest.current = options;
  const [touchAvailable, setTouchAvailable] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(any-pointer: coarse)");
    const update = () => setTouchAvailable(query.matches || navigator.maxTouchPoints > 0);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const controller = new TouchGestureController();
    const replayed = new WeakSet<Event>();
    const originals = new Map<number, PointerEvent>();
    const pens = new Map<number, PointerEvent>();
    let disposing = false;
    let suppressClickUntil = 0;
    const replay = (type: string, action: Exclude<TouchAction, { type: "navigate" | "idle" }>) => {
      const original = originals.get(action.point.id);
      if (!original) return;
      const target = original.target instanceof Element && original.target.isConnected ? original.target : root;
      const event = new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        pointerId: action.point.id, pointerType: original.pointerType, isPrimary: original.isPrimary,
        clientX: action.point.x, clientY: action.point.y,
        button: 0, buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
        pressure: original.pressure, width: original.width, height: original.height,
        shiftKey: original.shiftKey || latest.current.additive, altKey: original.altKey,
        ctrlKey: original.ctrlKey, metaKey: original.metaKey,
      });
      replayed.add(event);
      // Native capture listeners run outside React. Flush the tool's down state
      // before its move/up, including a tap completed in a single native event.
      if (disposing) target.dispatchEvent(event);
      else flushSync(() => target.dispatchEvent(event));
    };
    const apply = (actions: TouchAction[]) => {
      for (const action of actions) {
        if (action.type === "navigate") latest.current.navigate(action.navigation);
        else if (action.type === "idle") latest.current.idle?.();
        else if (action.type === "tap") {
          if (latest.current.allowTap) {
            replay("pointerdown", action);
            replay("pointerup", action);
          }
        } else replay({ start: "pointerdown", move: "pointermove", end: "pointerup", cancel: "pointercancel" }[action.type], action);
      }
    };
    const cancel = () => {
      const activePens = [...pens];
      pens.clear();
      apply(controller.cancel());
      for (const [id, event] of activePens) replay("pointercancel", { type: "cancel", point: { id, x: event.clientX, y: event.clientY } });
      for (const id of originals.keys()) if (root.hasPointerCapture(id)) root.releasePointerCapture(id);
      originals.clear();
      pens.clear();
    };
    const handle = (event: PointerEvent) => {
      if (replayed.has(event)) return;
      if (event.pointerType === "pen") {
        if (event.type === "pointerdown" && event.button === 0) {
          cancel();
          originals.set(event.pointerId, event);
          pens.set(event.pointerId, event);
          // Own the stroke from initial contact. In particular, do not leave
          // Pencil contact to Safari's native scrolling/text gesture handling.
          event.preventDefault();
          root.setPointerCapture(event.pointerId);
          setTouchAvailable(true);
        } else if (pens.has(event.pointerId)) {
          event.preventDefault();
          pens.set(event.pointerId, event);
        }
        if (event.type === "pointerup" || event.type === "pointercancel") {
          pens.delete(event.pointerId);
          originals.delete(event.pointerId);
          if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
        }
        return;
      }
      if (event.pointerType !== "touch") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickUntil = performance.now() + 500;
      setTouchAvailable(true);
      if (pens.size > 0 || latest.current.blocked?.()) return;
      const point = { id: event.pointerId, x: event.clientX, y: event.clientY };
      if (event.type === "pointerdown") {
        originals.set(event.pointerId, event);
        root.setPointerCapture(event.pointerId);
        apply(controller.down(point, latest.current.singleAction(event)));
      } else if (event.type === "pointermove") {
        apply(controller.move(point));
      } else if (event.type === "pointerup") {
        apply(controller.up(point));
        originals.delete(event.pointerId);
        if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
      } else cancel();
    };
    const suppressCompatibilityClick = (event: MouseEvent) => {
      if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const onVisibility = () => { if (document.hidden) cancel(); };
    const releasePen = (event: PointerEvent) => {
      if (!replayed.has(event) && event.pointerType === "pen" && pens.has(event.pointerId)) cancel();
    };
    const events = ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const;
    for (const type of events) root.addEventListener(type, handle as EventListener, { capture: true, passive: false });
    root.addEventListener("click", suppressCompatibilityClick as EventListener, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("pointerup", releasePen);
    window.addEventListener("pointercancel", releasePen);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposing = true;
      cancel();
      for (const type of events) root.removeEventListener(type, handle as EventListener, true);
      root.removeEventListener("click", suppressCompatibilityClick as EventListener, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pointerup", releasePen);
      window.removeEventListener("pointercancel", releasePen);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ref, options.resetKey]);

  return touchAvailable;
}
