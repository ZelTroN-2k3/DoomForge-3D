"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { toolbarMenuPosition } from "@/lib/toolbarMenuPosition";

/** Fixed children escape the ribbon's scrolling clip while remaining inside
 * their menu owner's DOM tree for outside-click detection and theme inheritance.
 */
export function useToolbarMenuPosition(open: boolean, anchor: RefObject<HTMLElement | null>, width: number): CSSProperties {
  const [position, setPosition] = useState<ReturnType<typeof toolbarMenuPosition> | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const update = () => {
      const bounds = anchor.current?.getBoundingClientRect();
      if (!bounds) return;
      const viewport = window.visualViewport;
      const next = toolbarMenuPosition(bounds, {
        width: viewport?.width ?? window.innerWidth,
        height: viewport?.height ?? window.innerHeight,
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
      }, width);
      setPosition((current) => current && current.left === next.left && current.top === next.top && current.width === next.width && current.maxHeight === next.maxHeight ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [anchor, open, width]);
  return { ...position, position: "fixed", visibility: position ? "visible" : "hidden", overflowY: "auto", overscrollBehavior: "contain" };
}
