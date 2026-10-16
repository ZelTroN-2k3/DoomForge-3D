import { describe, expect, it } from "vitest";
import { toolbarMenuPosition } from "@/lib/toolbarMenuPosition";

describe("toolbar dropdown positioning", () => {
  it.each([390, 820, 1024, 1366])("positions a dropdown below the touch toolbar at %i px", (width) => {
    const position = toolbarMenuPosition({ left: 360, bottom: 120 }, { width, height: 900 }, 264);
    expect(position.top).toBe(124);
    expect(position.left).toBeGreaterThanOrEqual(8);
    expect(position.left + position.width).toBeLessThanOrEqual(width - 8);
    expect(position.top + position.maxHeight).toBe(892);
  });

  it("keeps right-hand menus inside the viewport", () => {
    const position = toolbarMenuPosition({ left: 1300, bottom: 120 }, { width: 1366, height: 1024 }, 276);
    expect(position.left).toBe(1082);
    expect(position.width).toBe(276);
  });

  it("constrains menu height after landscape rotation or keyboard resizing", () => {
    const position = toolbarMenuPosition({ left: 250, bottom: 120 }, { width: 844, height: 390 }, 280);
    expect(position.maxHeight).toBe(258);
    expect(position.top + position.maxHeight).toBeLessThan(390);
  });

  it("accounts for the visual viewport when the browser page is zoomed", () => {
    const position = toolbarMenuPosition({ left: 100, bottom: 120 }, { width: 400, height: 500, left: 200, top: 150 }, 264);
    expect(position.left).toBe(208);
    expect(position.top).toBe(158);
    expect(position.top + position.maxHeight).toBe(642);
  });
});
