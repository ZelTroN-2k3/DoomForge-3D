import { unzipSync, strFromU8 } from "fflate";
import type { WorkplaneShape } from "@/types/sketchforge";
import { createLocalId } from "@/lib/localIds";

interface WadLumpEntry {
  name: string;
  filepos: number;
  size: number;
}

interface DoomVertex {
  x: number;
  y: number;
}

interface DoomSector {
  floorheight: number;
  ceilingheight: number;
  floorpic: string;
  ceilingpic: string;
  lightlevel: number;
  special: number;
  tag: number;
}

interface DoomSidedef {
  sector: number;
  upperTexture: string;
  lowerTexture: string;
  middleTexture: string;
}

interface DoomLinedef {
  v1: number;
  v2: number;
  flags: number;
  special: number;
  tag: number;
  side0: number;
  side1: number;
}

interface DoomThing {
  x: number;
  y: number;
  angle: number;
  type: number;
  flags: number;
}

export interface ParsedDoomMap {
  mapName: string;
  vertices: DoomVertex[];
  sectors: DoomSector[];
  sidedefs: DoomSidedef[];
  linedefs: DoomLinedef[];
  things: DoomThing[];
}

const DOOM_SCALE = 0.25; // 64 Doom units = 16 DoomForge units

/** Read null-padded ASCII string from Uint8Array */
function readAscii(bytes: Uint8Array, offset: number, maxLength: number): string {
  let str = "";
  for (let i = 0; i < maxLength; i++) {
    const code = bytes[offset + i];
    if (!code) break;
    str += String.fromCharCode(code);
  }
  return str.trim().toUpperCase();
}

/** Parse WAD lumps table */
export function parseWadLumps(bytes: Uint8Array): { type: "IWAD" | "PWAD"; entries: WadLumpEntry[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== "IWAD" && magic !== "PWAD") {
    throw new Error(`Fichier WAD invalide (signature trouvée: "${magic}", attendue: IWAD ou PWAD)`);
  }

  const numLumps = view.getInt32(4, true);
  const dirOffset = view.getInt32(8, true);

  if (numLumps < 0 || numLumps > 100000 || dirOffset < 12 || dirOffset > bytes.byteLength) {
    throw new Error("Structure de répertoire WAD corrompue");
  }

  const entries: WadLumpEntry[] = [];
  for (let i = 0; i < numLumps; i++) {
    const entryOffset = dirOffset + i * 16;
    const filepos = view.getInt32(entryOffset, true);
    const size = view.getInt32(entryOffset + 4, true);
    const name = readAscii(bytes, entryOffset + 8, 8);
    entries.push({ name, filepos, size });
  }

  return { type: magic, entries };
}

/** Parse UDMF (Universal Doom Map Format) text map */
function parseUdmfMap(text: string, mapName = "UDMF"): ParsedDoomMap {
  const vertices: DoomVertex[] = [];
  const sectors: DoomSector[] = [];
  const sidedefs: DoomSidedef[] = [];
  const linedefs: DoomLinedef[] = [];
  const things: DoomThing[] = [];

  // Match blocks: blockType { key = value; ... }
  const blockRegex = /([a-zA-Z0-9_]+)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(text)) !== null) {
    const type = match[1].toLowerCase();
    const body = match[2];

    const fields: Record<string, string> = {};
    const fieldRegex = /([a-zA-Z0-9_]+)\s*=\s*([^;]+);/g;
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      fields[fieldMatch[1].toLowerCase()] = fieldMatch[2].trim().replace(/^["']|["']$/g, "");
    }

    if (type === "vertex") {
      vertices.push({
        x: parseFloat(fields.x || "0"),
        y: parseFloat(fields.y || "0"),
      });
    } else if (type === "sector") {
      sectors.push({
        floorheight: parseFloat(fields.heightfloor || "0"),
        ceilingheight: parseFloat(fields.heightceiling || "128"),
        floorpic: fields.texturefloor || "FLOOR",
        ceilingpic: fields.textureceiling || "CEIL",
        lightlevel: parseInt(fields.lightlevel || "160", 10),
        special: parseInt(fields.special || "0", 10),
        tag: parseInt(fields.tag || "0", 10),
      });
    } else if (type === "sidedef") {
      sidedefs.push({
        sector: parseInt(fields.sector || "0", 10),
        upperTexture: fields.texturetop || "-",
        lowerTexture: fields.texturebottom || "-",
        middleTexture: fields.texturemiddle || "-",
      });
    } else if (type === "linedef") {
      linedefs.push({
        v1: parseInt(fields.v1 || "0", 10),
        v2: parseInt(fields.v2 || "0", 10),
        flags: parseInt(fields.flags || "0", 10),
        special: parseInt(fields.special || "0", 10),
        tag: parseInt(fields.tag || "0", 10),
        side0: fields.sidefront ? parseInt(fields.sidefront, 10) : 0,
        side1: fields.sideback !== undefined ? parseInt(fields.sideback, 10) : -1,
      });
    } else if (type === "thing") {
      things.push({
        x: parseFloat(fields.x || "0"),
        y: parseFloat(fields.y || "0"),
        angle: parseFloat(fields.angle || "0"),
        type: parseInt(fields.type || "1", 10),
        flags: parseInt(fields.flags || "0", 10),
      });
    }
  }

  return { mapName, vertices, sectors, sidedefs, linedefs, things };
}

/** Parse Doom map from binary lumps */
export function parseDoomMap(bytes: Uint8Array, lumpEntries: WadLumpEntry[], targetMapName?: string): ParsedDoomMap {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Find map marker index
  let mapIndex = -1;
  const mapRegex = /^(E\dM\d|MAP\d\d)$/i;

  for (let i = 0; i < lumpEntries.length; i++) {
    const entry = lumpEntries[i];
    if (targetMapName && entry.name === targetMapName.toUpperCase()) {
      mapIndex = i;
      break;
    }
    if (!targetMapName && mapRegex.test(entry.name)) {
      mapIndex = i;
      break;
    }
  }

  // Fallback: check if any lump is followed by THINGS and LINEDEFS
  if (mapIndex === -1) {
    for (let i = 0; i < lumpEntries.length - 2; i++) {
      if (
        lumpEntries[i + 1]?.name === "THINGS" &&
        lumpEntries[i + 2]?.name === "LINEDEFS"
      ) {
        mapIndex = i;
        break;
      }
    }
  }

  if (mapIndex === -1) {
    throw new Error("Aucune carte Doom trouvée dans ce fichier WAD (attendu: E1M1, MAP01, ou en-têtes THINGS/LINEDEFS)");
  }

  const mapName = lumpEntries[mapIndex].name;

  // Check for UDMF TEXTMAP
  for (let i = mapIndex + 1; i < Math.min(lumpEntries.length, mapIndex + 12); i++) {
    if (lumpEntries[i].name === "TEXTMAP") {
      const entry = lumpEntries[i];
      const text = strFromU8(bytes.subarray(entry.filepos, entry.filepos + entry.size));
      return parseUdmfMap(text, mapName);
    }
  }

  // Map lump dictionary
  const mapLumps = new Map<string, WadLumpEntry>();
  for (let i = mapIndex + 1; i < Math.min(lumpEntries.length, mapIndex + 14); i++) {
    const entry = lumpEntries[i];
    // Stop if we hit another map marker
    if (mapRegex.test(entry.name) && entry.name !== mapName) break;
    mapLumps.set(entry.name, entry);
  }

  // 1. VERTEXES
  const vertexLump = mapLumps.get("VERTEXES");
  if (!vertexLump) throw new Error(`Lump VERTEXES introuvable pour la carte ${mapName}`);
  const vertexCount = Math.floor(vertexLump.size / 4);
  const vertices: DoomVertex[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const pos = vertexLump.filepos + i * 4;
    vertices.push({
      x: view.getInt16(pos, true),
      y: view.getInt16(pos + 2, true),
    });
  }

  // 2. SECTORS
  const sectorLump = mapLumps.get("SECTORS");
  if (!sectorLump) throw new Error(`Lump SECTORS introuvable pour la carte ${mapName}`);
  const sectorCount = Math.floor(sectorLump.size / 26);
  const sectors: DoomSector[] = [];
  for (let i = 0; i < sectorCount; i++) {
    const pos = sectorLump.filepos + i * 26;
    sectors.push({
      floorheight: view.getInt16(pos, true),
      ceilingheight: view.getInt16(pos + 2, true),
      floorpic: readAscii(bytes, pos + 4, 8),
      ceilingpic: readAscii(bytes, pos + 12, 8),
      lightlevel: view.getInt16(pos + 20, true),
      special: view.getInt16(pos + 22, true),
      tag: view.getInt16(pos + 24, true),
    });
  }

  // 3. SIDEDEFS
  const sideLump = mapLumps.get("SIDEDEFS");
  if (!sideLump) throw new Error(`Lump SIDEDEFS introuvable pour la carte ${mapName}`);
  const sideCount = Math.floor(sideLump.size / 30);
  const sidedefs: DoomSidedef[] = [];
  for (let i = 0; i < sideCount; i++) {
    const pos = sideLump.filepos + i * 30;
    sidedefs.push({
      upperTexture: readAscii(bytes, pos + 4, 8),
      lowerTexture: readAscii(bytes, pos + 12, 8),
      middleTexture: readAscii(bytes, pos + 20, 8),
      sector: view.getInt16(pos + 28, true),
    });
  }

  // 4. LINEDEFS
  const lineLump = mapLumps.get("LINEDEFS");
  if (!lineLump) throw new Error(`Lump LINEDEFS introuvable pour la carte ${mapName}`);
  const lineCount = Math.floor(lineLump.size / 14);
  const linedefs: DoomLinedef[] = [];
  for (let i = 0; i < lineCount; i++) {
    const pos = lineLump.filepos + i * 14;
    linedefs.push({
      v1: view.getInt16(pos, true),
      v2: view.getInt16(pos + 2, true),
      flags: view.getInt16(pos + 4, true),
      special: view.getInt16(pos + 6, true),
      tag: view.getInt16(pos + 8, true),
      side0: view.getInt16(pos + 10, true),
      side1: view.getInt16(pos + 12, true),
    });
  }

  // 5. THINGS
  const thingLump = mapLumps.get("THINGS");
  const things: DoomThing[] = [];
  if (thingLump) {
    const thingCount = Math.floor(thingLump.size / 10);
    for (let i = 0; i < thingCount; i++) {
      const pos = thingLump.filepos + i * 10;
      things.push({
        x: view.getInt16(pos, true),
        y: view.getInt16(pos + 2, true),
        angle: view.getInt16(pos + 4, true),
        type: view.getInt16(pos + 6, true),
        flags: view.getInt16(pos + 8, true),
      });
    }
  }

  return { mapName, vertices, sectors, sidedefs, linedefs, things };
}

/** Convert a parsed Doom map into standard 3D WorkplaneShapes for DoomForge 3D */
export function convertDoomMapToShapes(map: ParsedDoomMap): WorkplaneShape[] {
  const shapes: WorkplaneShape[] = [];

  // Compute map bounding box to center it on the workplane (0, 0)
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  map.vertices.forEach((v) => {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  });

  const centerX = minX !== Infinity ? (minX + maxX) / 2 : 0;
  const centerY = minY !== Infinity ? (minY + maxY) / 2 : 0;

  // 1. Generate Walls from Linedefs
  map.linedefs.forEach((line, lineIdx) => {
    const v1 = map.vertices[line.v1];
    const v2 = map.vertices[line.v2];
    if (!v1 || !v2) return;

    // Convert from Doom coordinate system to 3D workplane coordinates:
    // Doom X -> 3D X
    // Doom Y -> 3D Z
    // Doom Z -> 3D Y (elevation)
    const x1 = (v1.x - centerX) * DOOM_SCALE;
    const z1 = (v1.y - centerY) * DOOM_SCALE;
    const x2 = (v2.x - centerX) * DOOM_SCALE;
    const z2 = (v2.y - centerY) * DOOM_SCALE;

    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 0.5) return;

    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    // Rotation in degrees around Y axis
    const angleRad = Math.atan2(dz, dx);
    const rotationDeg = -(angleRad * 180) / Math.PI;

    const side0 = map.sidedefs[line.side0];
    const side1 = line.side1 >= 0 ? map.sidedefs[line.side1] : null;

    const sector0 = side0 ? map.sectors[side0.sector] : null;
    const sector1 = side1 ? map.sectors[side1.sector] : null;

    if (!sector0) return;

    const wallThickness = 3;

    // Case A: 1-sided wall (Solid boundary wall)
    if (!sector1) {
      const floorH = sector0.floorheight * DOOM_SCALE;
      const ceilH = sector0.ceilingheight * DOOM_SCALE;
      const height = Math.max(8, ceilH - floorH);

      shapes.push({
        id: createLocalId("shape"),
        name: `Wall #${lineIdx + 1}`,
        kind: "box",
        x: midX,
        z: midZ,
        elevation: floorH,
        size: length,
        width: length,
        depth: wallThickness,
        height,
        rotation: rotationDeg,
        color: "#52525b",
      });
    } else {
      // Case B: 2-sided line (Portal / Door / Step between two sectors)
      const floor0 = sector0.floorheight * DOOM_SCALE;
      const ceil0 = sector0.ceilingheight * DOOM_SCALE;
      const floor1 = sector1.floorheight * DOOM_SCALE;
      const ceil1 = sector1.ceilingheight * DOOM_SCALE;

      // Lower step wall (if floor heights differ)
      if (Math.abs(floor0 - floor1) >= 1) {
        const stepBottom = Math.min(floor0, floor1);
        const stepTop = Math.max(floor0, floor1);
        const stepHeight = stepTop - stepBottom;

        shapes.push({
          id: createLocalId("shape"),
          name: `Step #${lineIdx + 1}`,
          kind: "box",
          x: midX,
          z: midZ,
          elevation: stepBottom,
          size: length,
          width: length,
          depth: wallThickness,
          height: stepHeight,
          rotation: rotationDeg,
          color: "#71717a",
        });
      }

      // Upper wall / Lintel (if ceiling heights differ, or door closed/ajar)
      if (Math.abs(ceil0 - ceil1) >= 1) {
        const upperBottom = Math.min(ceil0, ceil1);
        const upperTop = Math.max(ceil0, ceil1);
        const upperHeight = upperTop - upperBottom;

        shapes.push({
          id: createLocalId("shape"),
          name: `Lintel #${lineIdx + 1}`,
          kind: "box",
          x: midX,
          z: midZ,
          elevation: upperBottom,
          size: length,
          width: length,
          depth: wallThickness,
          height: upperHeight,
          rotation: rotationDeg,
          color: "#3f3f46",
        });
      }
    }
  });

  // 2. Generate Floors from Sectors (approximate bounding plates or floor markers)
  // For each sector, find connected vertices to approximate floor slab
  map.sectors.forEach((sec, sIdx) => {
    let sMinX = Infinity, sMaxX = -Infinity, sMinZ = Infinity, sMaxZ = -Infinity;
    map.sidedefs.forEach((side, sideIdx) => {
      if (side.sector !== sIdx) return;
      // find linedef using this side
      map.linedefs.forEach((ld) => {
        if (ld.side0 === sideIdx || ld.side1 === sideIdx) {
          const va = map.vertices[ld.v1];
          const vb = map.vertices[ld.v2];
          if (va) {
            const xa = (va.x - centerX) * DOOM_SCALE;
            const za = (va.y - centerY) * DOOM_SCALE;
            if (xa < sMinX) sMinX = xa; if (xa > sMaxX) sMaxX = xa;
            if (za < sMinZ) sMinZ = za; if (za > sMaxZ) sMaxZ = za;
          }
          if (vb) {
            const xb = (vb.x - centerX) * DOOM_SCALE;
            const zb = (vb.y - centerY) * DOOM_SCALE;
            if (xb < sMinX) sMinX = xb; if (xb > sMaxX) sMaxX = xb;
            if (zb < sMinZ) sMinZ = zb; if (zb > sMaxZ) sMaxZ = zb;
          }
        }
      });
    });

    if (sMinX !== Infinity && sMaxX > sMinX && sMaxZ > sMinZ) {
      const sw = sMaxX - sMinX;
      const sd = sMaxZ - sMinZ;
      const floorElev = sec.floorheight * DOOM_SCALE;

      // Only add floor plate if reasonable size
      if (sw > 4 && sd > 4 && sw < 1200 && sd < 1200) {
        shapes.push({
          id: createLocalId("shape"),
          name: `Floor Sector #${sIdx + 1}`,
          kind: "box",
          x: (sMinX + sMaxX) / 2,
          z: (sMinZ + sMaxZ) / 2,
          elevation: floorElev - 2, // 2 units below floor surface
          size: Math.min(sw, sd),
          width: sw,
          depth: sd,
          height: 2,
          rotation: 0,
          color: sec.floorpic.includes("NUK") || sec.floorpic.includes("SLIME") ? "#65a30d" : sec.floorpic.includes("LAVA") ? "#dc2626" : "#27272a",
        });
      }
    }
  });

  // 3. Generate Things (Monsters, Weapons, Pickups, Barrels, Player Start)
  map.things.forEach((thing, tIdx) => {
    const tx = (thing.x - centerX) * DOOM_SCALE;
    const tz = (thing.y - centerY) * DOOM_SCALE;
    const angle = thing.angle;

    // Default ground elevation 0
    let elevation = 0;

    switch (thing.type) {
      case 1: // Player 1 Start
        shapes.push({
          id: createLocalId("shape"),
          name: "Player Start",
          kind: "cylinder",
          x: tx,
          z: tz,
          elevation,
          size: 16,
          width: 16,
          depth: 16,
          height: 24,
          rotation: angle,
          color: "#22c55e",
        });
        break;

      case 3004: // Former Human / Zombie
      case 9:    // Shotgun Guy
      case 3001: // Imp
        shapes.push({
          id: createLocalId("shape"),
          name: "Monster: Imp",
          kind: "pyramid",
          x: tx,
          z: tz,
          elevation,
          size: 14,
          width: 14,
          depth: 14,
          height: 26,
          rotation: angle,
          color: "#b45309",
        });
        break;

      case 3002: // Demon (Pinky)
      case 58:   // Spectre
      case 3003: // Baron of Hell
      case 3005: // Cacodemon
      case 16:   // Cyberdemon
        shapes.push({
          id: createLocalId("shape"),
          name: "Monster: Demon",
          kind: "box",
          x: tx,
          z: tz,
          elevation,
          size: 22,
          width: 22,
          depth: 22,
          height: 28,
          rotation: angle,
          color: "#e11d48",
        });
        break;

      case 2001: // Shotgun
      case 82:   // Super Shotgun
        shapes.push({
          id: createLocalId("shape"),
          name: "Weapon: Shotgun",
          kind: "tube",
          x: tx,
          z: tz,
          elevation,
          size: 18,
          width: 18,
          depth: 6,
          height: 6,
          rotation: angle,
          color: "#38bdf8",
        });
        break;

      case 2012: // Medikit
      case 2011: // Stimpack
        shapes.push({
          id: createLocalId("shape"),
          name: "Pickup: Medikit",
          kind: "box",
          x: tx,
          z: tz,
          elevation,
          size: 10,
          width: 10,
          depth: 10,
          height: 8,
          rotation: angle,
          color: "#f8fafc",
        });
        break;

      case 2018: // Green Armor
      case 2019: // Blue MegaArmor
        shapes.push({
          id: createLocalId("shape"),
          name: "Pickup: Green Armor",
          kind: "box",
          x: tx,
          z: tz,
          elevation,
          size: 12,
          width: 12,
          depth: 8,
          height: 14,
          rotation: angle,
          color: "#10b981",
        });
        break;

      case 2002: // Chaingun
      case 2003: // Rocket Launcher
      case 2005: // Chainsaw
      case 2048: // Ammo box
      case 2049: // Box of shells
        shapes.push({
          id: createLocalId("shape"),
          name: "Pickup: Ammo Box",
          kind: "box",
          x: tx,
          z: tz,
          elevation,
          size: 8,
          width: 8,
          depth: 8,
          height: 8,
          rotation: angle,
          color: "#eab308",
        });
        break;

      case 2035: // Explosive Barrel
        shapes.push({
          id: createLocalId("shape"),
          name: "Prop: Explosive Barrel",
          kind: "cylinder",
          x: tx,
          z: tz,
          elevation,
          size: 12,
          width: 12,
          depth: 12,
          height: 20,
          rotation: angle,
          color: "#84cc16",
        });
        break;

      case 2028: // Tech column
      case 34:   // Tech pillar
      case 35:   // Candle / lamp
      case 44:   // Blue torch
      case 45:   // Green torch
        shapes.push({
          id: createLocalId("shape"),
          name: "Prop: Tech Light Pillar",
          kind: "cylinder",
          x: tx,
          z: tz,
          elevation,
          size: 6,
          width: 6,
          depth: 6,
          height: 32,
          rotation: angle,
          color: "#f59e0b",
        });
        break;

      case 5:  // Blue card
      case 13: // Red card
      case 6:  // Yellow card
        shapes.push({
          id: createLocalId("shape"),
          name: thing.type === 5 ? "Keycard: Blue" : thing.type === 6 ? "Keycard: Yellow" : "Keycard: Red",
          kind: "box",
          x: tx,
          z: tz,
          elevation,
          size: 6,
          width: 6,
          depth: 4,
          height: 8,
          rotation: angle,
          color: thing.type === 5 ? "#0284c7" : thing.type === 6 ? "#eab308" : "#dc2626",
        });
        break;
    }
  });

  return shapes;
}

/** Parse a .wad or .pk3 file and return full 3D level shapes */
export function importedShapesFromWadOrPk3(
  fileName: string,
  buffer: ArrayBuffer | Uint8Array,
  targetMapName?: string
): { shapes: WorkplaneShape[]; mapName: string } {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const ext = fileName.split(".").pop()?.toLowerCase();

  // 1. Handle PK3 (ZIP archive)
  if (ext === "pk3") {
    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(bytes);
    } catch {
      throw new Error("Impossible d'extraire l'archive .pk3 (format ZIP invalide)");
    }

    // Look for .wad file inside pk3
    let wadBytes: Uint8Array | null = null;
    let internalWadName = "";

    for (const [path, entryBytes] of Object.entries(unzipped)) {
      if (path.toLowerCase().endsWith(".wad")) {
        wadBytes = entryBytes;
        internalWadName = path;
        break;
      }
    }

    if (wadBytes) {
      const parsedLumps = parseWadLumps(wadBytes);
      const doomMap = parseDoomMap(wadBytes, parsedLumps.entries, targetMapName);
      const shapes = convertDoomMapToShapes(doomMap);
      return { shapes, mapName: doomMap.mapName || internalWadName };
    }

    // Check for direct UDMF maps/map01.txt or maps/textmap
    for (const [path, entryBytes] of Object.entries(unzipped)) {
      if (path.toLowerCase().includes("textmap") || path.toLowerCase().endsWith(".txt")) {
        const text = strFromU8(entryBytes);
        if (text.includes("vertex") && text.includes("linedef")) {
          const doomMap = parseUdmfMap(text, path);
          const shapes = convertDoomMapToShapes(doomMap);
          return { shapes, mapName: doomMap.mapName };
        }
      }
    }

    throw new Error("L'archive .pk3 ne contient aucun fichier .wad ou carte UDMF valide");
  }

  // 2. Handle standard binary WAD (.wad)
  const parsedLumps = parseWadLumps(bytes);
  const doomMap = parseDoomMap(bytes, parsedLumps.entries, targetMapName);
  const shapes = convertDoomMapToShapes(doomMap);
  return { shapes, mapName: doomMap.mapName };
}
