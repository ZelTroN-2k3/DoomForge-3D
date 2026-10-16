"use client";

import { useState } from "react";
export function TouchControls({ navigate, onNavigateChange, multiSelect, onMultiSelectChange, sketch = false }: {
  navigate: boolean;
  onNavigateChange: (value: boolean) => void;
  multiSelect?: boolean;
  onMultiSelectChange?: (value: boolean) => void;
  sketch?: boolean;
}) {
  const [help, setHelp] = useState(false);
  return (
    <div className="touch-controls" aria-label="Touch controls" onPointerDown={(event) => event.stopPropagation()}>
      <div className="touch-controls-buttons">
        <button type="button" aria-label={sketch ? "Draw / select" : "Edit"} aria-pressed={!navigate} onClick={() => onNavigateChange(false)}>{sketch ? "Draw" : "Edit"}</button>
        <button type="button" aria-label="Navigate" aria-pressed={navigate} onClick={() => onNavigateChange(true)}>View</button>
        {onMultiSelectChange ? <button type="button" aria-label="Multi-select" aria-pressed={multiSelect} onClick={() => onMultiSelectChange(!multiSelect)}>Multi</button> : null}
        <button type="button" aria-expanded={help} aria-label="Touch gesture help" onClick={() => setHelp(!help)}>?</button>
      </div>
      {help ? <p role="status">{sketch
        ? "Use one finger to draw or select. Pinch to zoom; drag two fingers to pan. Navigate lets one finger pan without drawing."
        : "Tap to select. Drag a selected object to move it; drag empty space to orbit. Pinch to zoom; drag two fingers to pan. Navigate orbits anywhere without editing. In Sculpt, use Edit to brush."} Pen input uses the active tool.</p> : null}
    </div>
  );
}
