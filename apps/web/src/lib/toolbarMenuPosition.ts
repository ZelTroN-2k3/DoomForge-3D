export function toolbarMenuPosition(
  anchor: { left: number; bottom: number },
  viewport: { width: number; height: number; left?: number; top?: number },
  preferredWidth: number,
) {
  const gutter = 8;
  const viewportLeft = viewport.left ?? 0;
  const viewportTop = viewport.top ?? 0;
  const width = Math.max(0, Math.min(preferredWidth, viewport.width - gutter * 2));
  const left = Math.max(viewportLeft + gutter, Math.min(anchor.left, viewportLeft + viewport.width - width - gutter));
  const top = Math.max(viewportTop + gutter, Math.min(anchor.bottom + 4, viewportTop + viewport.height - gutter - 44));
  return { left, top, width, maxHeight: Math.max(0, viewportTop + viewport.height - top - gutter) };
}
