const fs = require('fs');
const path = require('path');

const vpPath = path.join(__dirname, '../apps/web/src/components/WorkplaneViewport.tsx');
let code = fs.readFileSync(vpPath, 'utf8');

// Replacements in WorkplaneViewport.tsx

// 1. In setupScene
code = code.replace(
  /scene\.background = new THREE\.Color\("#f8fbfc"\);/g,
  'scene.background = new THREE.Color(workspace.background || theme.viewport.background);'
);

// 2. In buildWorkplaneGrid signature and usage
code = code.replace(
  /function buildWorkplaneGrid\(size: number, step: number, workspace: WorkplaneWorkspaceSettings\)/g,
  'function buildWorkplaneGrid(size: number, step: number, workspace: WorkplaneWorkspaceSettings, theme: AppTheme = defaultThemes.light)'
);
code = code.replace(
  /buildWorkplaneGrid\(size, step, workspace\)/g,
  'buildWorkplaneGrid(size, step, workspace, theme)'
);

// 2b. inside buildWorkplaneGrid colors
code = code.replace(/color: "#91dff0"/g, 'color: theme.viewport.gridMinor');
code = code.replace(/color: "#4bbddf"/g, 'color: theme.viewport.gridMajor');
code = code.replace(/color: "#34aad2"/g, 'color: theme.viewport.gridAxis');
code = code.replace(/color: "#58c5e6"/g, 'color: theme.viewport.gridBorder');

// 3. getHandleColor signature and usage
code = code.replace(
  /function getHandleColor\(hovered: boolean, active: boolean\)/g,
  'function getHandleColor(hovered: boolean, active: boolean, theme: AppTheme = defaultThemes.light)'
);
code = code.replace(
  /getHandleColor\(hovered, active\)/g,
  'getHandleColor(hovered, active, theme)'
);
code = code.replace(
  /active \? \(hovered \? "#ffbf45" : "#ff8a1d"\) : hovered \? "#84edff" : "#17b7e5"/g,
  'active ? (hovered ? theme.viewport.handleHover : theme.viewport.handleActive) : hovered ? theme.viewport.handleHoverAlt : theme.viewport.handleActiveAlt'
);
// Also #17b7e5 might be handleDefault? wait, no. handleDefault is #00aeea. The replacement above works for handleColor logic.

// 4. In buildTransformHandle signature and usage
code = code.replace(
  /function buildTransformHandle\(kind: TransformHandleKind, axis: AlignAxis\)/g,
  'function buildTransformHandle(kind: TransformHandleKind, axis: AlignAxis, theme: AppTheme = defaultThemes.light)'
);
code = code.replace(
  /buildTransformHandle\(kind, axis\)/g,
  'buildTransformHandle(kind, axis, theme)'
);
code = code.replace(/color: "#e8eef1"/g, 'color: theme.viewport.handleMaterial');
code = code.replace(/color: "#273849"/g, 'color: theme.viewport.darkMaterial');
code = code.replace(/color: "#2c3339"/g, 'color: theme.viewport.dashMaterial');
code = code.replace(/color: "#2d3439"/g, 'color: theme.viewport.dashMaterial'); // approx
code = code.replace(/color: "#00aeea"/g, 'color: theme.viewport.handleDefault');

// 5. In addCadDisplayEdges signature and usage
code = code.replace(
  /function addCadDisplayEdges\(group: THREE\.Group, shape: WorkplaneShape, color: string, opacity: number\)/g,
  'function addCadDisplayEdges(group: THREE.Group, shape: WorkplaneShape, color: string, opacity: number, theme: AppTheme = defaultThemes.light)'
);
code = code.replace(
  /addCadDisplayEdges\(group, shape, edgeColor, edgeOpacity\)/g,
  'addCadDisplayEdges(group, shape, edgeColor, edgeOpacity, theme)'
);

// 6. complexEdges logic
code = code.replace(
  /const edgeColor = selectedOutline \? "#00aeea" : shape\.hole \? "#697989" : complexEdges \? "#141b21" : darkenHex\(shape\.color, 0\.34\);/g,
  'const edgeColor = selectedOutline ? theme.viewport.handleDefault : shape.hole ? theme.viewport.holeEdge : complexEdges ? theme.viewport.complexEdge : darkenHex(shape.color, 0.34);'
);

// 7. hole shape color replacement
code = code.replace(
  /hole: true, color: "#b8c2cc"/g,
  'hole: true, color: theme.viewport.hole'
);
code = code.replace(
  /shape\.hole \? "#b7c0c9" : shape\.color/g,
  'shape.hole ? theme.viewport.hole : shape.color'
);

// 8. rebuildWorkplane signature
code = code.replace(
  /function rebuildWorkplane\(state: ViewportState, workspace: WorkplaneWorkspaceSettings\)/g,
  'function rebuildWorkplane(state: ViewportState, workspace: WorkplaneWorkspaceSettings, theme: AppTheme = defaultThemes.light)'
);
code = code.replace(
  /rebuildWorkplane\(threeRef\.current, workspace\);/g,
  'rebuildWorkplane(threeRef.current, workspace, theme);'
);

fs.writeFileSync(vpPath, code);
console.log('Refactored WorkplaneViewport colors');
