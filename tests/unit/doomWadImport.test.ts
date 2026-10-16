import { describe, expect, it } from "vitest";
import { parseWadLumps, parseDoomMap, convertDoomMapToShapes, importedShapesFromWadOrPk3 } from "@/lib/doomWadImport";
import { zipSync, strToU8 } from "fflate";

describe("Doom WAD & PK3 Import", () => {
  function createSampleWadBuffer(): Uint8Array {
    // Construct a minimal PWAD with 1 room (4 walls) and 1 Player Start + 1 Imp
    const vertexData = new Int16Array([
      -100, -100, // v0
       100, -100, // v1
       100,  100, // v2
      -100,  100, // v3
    ]);

    const sectorData = new Uint8Array(26);
    const secView = new DataView(sectorData.buffer);
    secView.setInt16(0, 0, true);   // floorheight = 0
    secView.setInt16(2, 128, true); // ceilingheight = 128
    // floorpic / ceilingpic
    sectorData.set(new TextEncoder().encode("FLOOR4_8"), 4);
    sectorData.set(new TextEncoder().encode("CEIL3_5"), 12);
    secView.setInt16(20, 192, true); // lightlevel

    const sidedefData = new Uint8Array(30);
    const sideView = new DataView(sidedefData.buffer);
    sidedefData.set(new TextEncoder().encode("STARTAN3"), 20); // middleTexture
    sideView.setInt16(28, 0, true); // sector 0

    // 4 linedefs forming a square room
    const linedefData = new Uint8Array(14 * 4);
    const lineView = new DataView(linedefData.buffer);
    const lines = [
      [0, 1], // South wall
      [1, 2], // East wall
      [2, 3], // North wall
      [3, 0], // West wall
    ];
    lines.forEach(([v1, v2], idx) => {
      const offset = idx * 14;
      lineView.setInt16(offset, v1, true);
      lineView.setInt16(offset + 2, v2, true);
      lineView.setInt16(offset + 4, 1, true); // impassable flag
      lineView.setInt16(offset + 6, 0, true); // special
      lineView.setInt16(offset + 8, 0, true); // tag
      lineView.setInt16(offset + 10, 0, true); // side0 = 0
      lineView.setInt16(offset + 12, -1, true); // side1 = -1 (one-sided)
    });

    // 2 Things: Player 1 Start (type 1) and Imp (type 3001)
    const thingData = new Uint8Array(10 * 2);
    const thingView = new DataView(thingData.buffer);
    // Thing 0: Player 1 Start at (0, 0)
    thingView.setInt16(0, 0, true);
    thingView.setInt16(2, 0, true);
    thingView.setInt16(4, 90, true);
    thingView.setInt16(6, 1, true); // type 1
    thingView.setInt16(8, 7, true);
    // Thing 1: Imp at (50, 50)
    thingView.setInt16(10, 50, true);
    thingView.setInt16(12, 50, true);
    thingView.setInt16(14, 270, true);
    thingView.setInt16(16, 3001, true); // type 3001
    thingView.setInt16(18, 7, true);

    const lumps = [
      { name: "MAP01", data: new Uint8Array(0) },
      { name: "THINGS", data: thingData },
      { name: "LINEDEFS", data: linedefData },
      { name: "SIDEDEFS", data: sidedefData },
      { name: "VERTEXES", data: new Uint8Array(vertexData.buffer) },
      { name: "SECTORS", data: sectorData },
    ];

    // Total file size
    let curPos = 12; // header size
    const lumpEntries: Array<{ name: string; filepos: number; size: number; data: Uint8Array }> = [];
    for (const lump of lumps) {
      lumpEntries.push({ name: lump.name, filepos: curPos, size: lump.data.byteLength, data: lump.data });
      curPos += lump.data.byteLength;
    }
    const dirOffset = curPos;
    const totalSize = dirOffset + lumps.length * 16;

    const out = new Uint8Array(totalSize);
    const outView = new DataView(out.buffer);

    // Header
    out.set(new TextEncoder().encode("PWAD"), 0);
    outView.setInt32(4, lumps.length, true);
    outView.setInt32(8, dirOffset, true);

    // Lump data
    for (const entry of lumpEntries) {
      out.set(entry.data, entry.filepos);
    }

    // Directory table
    for (let i = 0; i < lumpEntries.length; i++) {
      const entry = lumpEntries[i];
      const entryPos = dirOffset + i * 16;
      outView.setInt32(entryPos, entry.filepos, true);
      outView.setInt32(entryPos + 4, entry.size, true);
      const nameBytes = new TextEncoder().encode(entry.name);
      out.set(nameBytes, entryPos + 8);
    }

    return out;
  }

  it("parses lumps from a binary WAD file", () => {
    const wadBytes = createSampleWadBuffer();
    const { type, entries } = parseWadLumps(wadBytes);
    expect(type).toBe("PWAD");
    expect(entries.length).toBe(6);
    expect(entries[0].name).toBe("MAP01");
    expect(entries[1].name).toBe("THINGS");
    expect(entries[2].name).toBe("LINEDEFS");
  });

  it("extracts a Doom map and converts it into 3D shapes", () => {
    const wadBytes = createSampleWadBuffer();
    const { shapes, mapName } = importedShapesFromWadOrPk3("doom2_level.wad", wadBytes);

    expect(mapName).toBe("MAP01");
    expect(shapes.length).toBeGreaterThan(0);

    // Check for walls (4 linedefs -> 4 wall boxes)
    const walls = shapes.filter((s) => s.name.startsWith("Wall #"));
    expect(walls.length).toBe(4);
    expect(walls[0].kind).toBe("box");
    expect(walls[0].height).toBeGreaterThan(0);

    // Check for Player Start
    const playerStart = shapes.find((s) => s.name === "Player Start");
    expect(playerStart).toBeDefined();
    expect(playerStart?.color).toBe("#22c55e");

    // Check for Imp monster
    const imp = shapes.find((s) => s.name === "Monster: Imp");
    expect(imp).toBeDefined();
    expect(imp?.kind).toBe("pyramid");
  });

  it("extracts a Doom map from inside a .pk3 archive", () => {
    const wadBytes = createSampleWadBuffer();
    // Create a zip with maps/map01.wad inside
    const pk3Bytes = zipSync({
      "maps/map01.wad": wadBytes,
    });

    const { shapes, mapName } = importedShapesFromWadOrPk3("mymod.pk3", pk3Bytes);
    expect(mapName).toBe("MAP01");
    expect(shapes.length).toBeGreaterThan(0);

    const playerStart = shapes.find((s) => s.name === "Player Start");
    expect(playerStart).toBeDefined();
  });

  it("loads and parses the generated e1m1_sample.wad file correctly", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const wadPath = path.resolve(__dirname, "../../apps/web/public/assets/doomforge/maps/e1m1_sample.wad");
    const wadBuffer = fs.readFileSync(wadPath);

    const { shapes, mapName } = importedShapesFromWadOrPk3("e1m1_sample.wad", wadBuffer);
    expect(mapName).toBe("E1M1");
    expect(shapes.length).toBeGreaterThan(15);

    // Verify Player Start, Monsters, Weapon, Items
    const playerStart = shapes.find((s) => s.name === "Player Start");
    expect(playerStart).toBeDefined();

    const imps = shapes.filter((s) => s.name === "Monster: Imp");
    expect(imps.length).toBe(2);

    const demon = shapes.find((s) => s.name === "Monster: Demon");
    expect(demon).toBeDefined();

    const shotgun = shapes.find((s) => s.name === "Weapon: Shotgun");
    expect(shotgun).toBeDefined();

    const redKey = shapes.find((s) => s.name === "Keycard: Red");
    expect(redKey).toBeDefined();
  });
});
