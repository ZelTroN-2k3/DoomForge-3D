import fs from "fs";
import path from "path";

// Helper to write PWAD
function buildDoomWad() {
  const vertices = [
    // Room 0 (Start Hangar, sector 0)
    [-240, -240], // 0: SW
    [   0, -240], // 1: SE
    [   0, -160], // 2: door south
    [   0,  -80], // 3: door north
    [   0,    0], // 4: NE
    [-240,    0], // 5: NW

    // Corridor (sector 1)
    [ 160, -160], // 6: corridor SE
    [ 160,  -80], // 7: corridor NE

    // Room 1 (Arena, sector 2)
    [ 160, -300], // 8: Arena SW
    [ 480, -300], // 9: Arena SE
    [ 480, -160], // 10: Arena exit door south
    [ 480,  -80], // 11: Arena exit door north
    [ 480,   60], // 12: Arena NE
    [ 160,   60], // 13: Arena NW

    // Room 2 (Exit Chamber, sector 3 - raised floor)
    [ 640, -200], // 14: Exit SE
    [ 640,  -40], // 15: Exit NE
    [ 480, -200], // 16: Exit SW
    [ 480,  -40], // 17: Exit NW
  ];

  const sectors = [
    { floor: 0, ceil: 128, floorpic: "FLOOR4_8", ceilpic: "CEIL3_5", light: 180 },
    { floor: 0, ceil: 96,  floorpic: "FLOOR0_1", ceilpic: "TLITE6_4", light: 140 },
    { floor: 0, ceil: 192, floorpic: "FLOOR5_1", ceilpic: "F_SKY1",   light: 210 },
    { floor: 24, ceil: 128, floorpic: "FLAT14",  ceilpic: "CEIL5_2", light: 190 },
  ];

  const sidedefs = [];
  function addSide(sector, mid = "STARTAN3", upper = "-", lower = "-") {
    sidedefs.push({ sector, mid, upper, lower });
    return sidedefs.length - 1;
  }

  const linedefs = [];
  function addWall(v1, v2, sector, mid = "BROWN96") {
    const s0 = addSide(sector, mid);
    linedefs.push({ v1, v2, flags: 1, side0: s0, side1: -1 });
  }
  function addPortal(v1, v2, secA, secB) {
    const s0 = addSide(secA, "-", "STEP4", "DOORTOP");
    const s1 = addSide(secB, "-", "STEP4", "DOORTOP");
    linedefs.push({ v1, v2, flags: 4, side0: s0, side1: s1 });
  }

  // Room 0 walls:
  addWall(0, 1, 0); // south
  addWall(1, 2, 0); // east bottom
  addPortal(2, 3, 0, 1); // doorway to corridor (2-sided)
  addWall(3, 4, 0); // east top
  addWall(4, 5, 0); // north
  addWall(5, 0, 0); // west

  // Corridor walls:
  addWall(2, 6, 1, "GRAY7"); // south corridor wall
  addPortal(6, 7, 1, 2);      // portal into Arena
  addWall(7, 3, 1, "GRAY7"); // north corridor wall

  // Arena walls:
  addWall(6, 8, 2, "BRICK1");
  addWall(8, 9, 2, "BRICK1");
  addWall(9, 10, 2, "BRICK1");
  addPortal(10, 11, 2, 3);    // portal to exit room
  addWall(11, 12, 2, "BRICK1");
  addWall(12, 13, 2, "BRICK1");
  addWall(13, 7, 2, "BRICK1");

  // Exit Room walls:
  addWall(10, 16, 3, "COMP2");
  addWall(16, 14, 3, "COMP2");
  addWall(14, 15, 3, "COMP2");
  addWall(15, 17, 3, "COMP2");
  addWall(17, 11, 3, "COMP2");

  const things = [
    // Room 0: Start
    { x: -160, y: -120, angle: 0, type: 1 },    // Player 1 Start facing East (0 deg)
    { x: -200, y: -200, angle: 0, type: 2018 }, // Green Armor
    { x: -200, y:  -40, angle: 0, type: 2005 }, // Ammo Clip Box
    { x:  -40, y: -200, angle: 0, type: 2011 }, // Stimpack

    // Corridor
    { x: 40, y: -120, angle: 0, type: 2028 },  // Tech Light Column
    { x: 120, y: -120, angle: 0, type: 2028 }, // Tech Light Column

    // Room 1: Arena
    { x: 200, y: -120, angle: 0, type: 2001 },  // Shotgun
    { x: 220, y: -120, angle: 0, type: 2008 },  // Box of Shells
    { x: 320, y:  -40, angle: 180, type: 3001 }, // Imp
    { x: 320, y: -200, angle: 180, type: 3001 }, // Imp
    { x: 400, y: -120, angle: 180, type: 3002 }, // Demon Pinky
    { x: 260, y:  -40, angle: 0, type: 2035 },   // Explosive Barrel
    { x: 260, y: -200, angle: 0, type: 2035 },   // Explosive Barrel
    { x: 440, y:   20, angle: 0, type: 2012 },   // Medikit

    // Room 2: Exit
    { x: 560, y: -120, angle: 180, type: 13 },   // Red Keycard
    { x: 600, y: -120, angle: 180, type: 2028 }, // Tech Column Exit marker
  ];

  // Encode binary lumps
  // 1. VERTEXES (4 bytes per vertex)
  const vertexBuf = new Uint8Array(vertices.length * 4);
  const vView = new DataView(vertexBuf.buffer);
  vertices.forEach(([vx, vy], i) => {
    vView.setInt16(i * 4, vx, true);
    vView.setInt16(i * 4 + 2, vy, true);
  });

  // 2. SECTORS (26 bytes per sector)
  const sectorBuf = new Uint8Array(sectors.length * 26);
  const sView = new DataView(sectorBuf.buffer);
  sectors.forEach((sec, i) => {
    const off = i * 26;
    sView.setInt16(off, sec.floor, true);
    sView.setInt16(off + 2, sec.ceil, true);
    sectorBuf.set(new TextEncoder().encode(sec.floorpic.padEnd(8, "\0").slice(0, 8)), off + 4);
    sectorBuf.set(new TextEncoder().encode(sec.ceilpic.padEnd(8, "\0").slice(0, 8)), off + 12);
    sView.setInt16(off + 20, sec.light, true);
    sView.setInt16(off + 22, 0, true);
    sView.setInt16(off + 24, 0, true);
  });

  // 3. SIDEDEFS (30 bytes per sidedef)
  const sideBuf = new Uint8Array(sidedefs.length * 30);
  const sideView = new DataView(sideBuf.buffer);
  sidedefs.forEach((sd, i) => {
    const off = i * 30;
    sideView.setInt16(off, 0, true);
    sideView.setInt16(off + 2, 0, true);
    sideBuf.set(new TextEncoder().encode((sd.upper || "-").padEnd(8, "\0").slice(0, 8)), off + 4);
    sideBuf.set(new TextEncoder().encode((sd.lower || "-").padEnd(8, "\0").slice(0, 8)), off + 12);
    sideBuf.set(new TextEncoder().encode((sd.mid || "-").padEnd(8, "\0").slice(0, 8)), off + 20);
    sideView.setInt16(off + 28, sd.sector, true);
  });

  // 4. LINEDEFS (14 bytes per linedef)
  const lineBuf = new Uint8Array(linedefs.length * 14);
  const lineView = new DataView(lineBuf.buffer);
  linedefs.forEach((ld, i) => {
    const off = i * 14;
    lineView.setInt16(off, ld.v1, true);
    lineView.setInt16(off + 2, ld.v2, true);
    lineView.setInt16(off + 4, ld.flags, true);
    lineView.setInt16(off + 6, 0, true);
    lineView.setInt16(off + 8, 0, true);
    lineView.setInt16(off + 10, ld.side0, true);
    lineView.setInt16(off + 12, ld.side1, true);
  });

  // 5. THINGS (10 bytes per thing)
  const thingBuf = new Uint8Array(things.length * 10);
  const thView = new DataView(thingBuf.buffer);
  things.forEach((th, i) => {
    const off = i * 10;
    thView.setInt16(off, th.x, true);
    thView.setInt16(off + 2, th.y, true);
    thView.setInt16(off + 4, th.angle, true);
    thView.setInt16(off + 6, th.type, true);
    thView.setInt16(off + 8, 7, true);
  });

  const lumps = [
    { name: "E1M1", data: new Uint8Array(0) },
    { name: "THINGS", data: thingBuf },
    { name: "LINEDEFS", data: lineBuf },
    { name: "SIDEDEFS", data: sideBuf },
    { name: "VERTEXES", data: vertexBuf },
    { name: "SECTORS", data: sectorBuf },
  ];

  let curPos = 12;
  const lumpEntries = [];
  for (const lump of lumps) {
    lumpEntries.push({ name: lump.name, filepos: curPos, size: lump.data.byteLength, data: lump.data });
    curPos += lump.data.byteLength;
  }
  const dirOffset = curPos;
  const totalSize = dirOffset + lumps.length * 16;

  const out = new Uint8Array(totalSize);
  const outView = new DataView(out.buffer);

  out.set(new TextEncoder().encode("PWAD"), 0);
  outView.setInt32(4, lumps.length, true);
  outView.setInt32(8, dirOffset, true);

  for (const entry of lumpEntries) {
    out.set(entry.data, entry.filepos);
  }

  for (let i = 0; i < lumpEntries.length; i++) {
    const entry = lumpEntries[i];
    const entryPos = dirOffset + i * 16;
    outView.setInt32(entryPos, entry.filepos, true);
    outView.setInt32(entryPos + 4, entry.size, true);
    out.set(new TextEncoder().encode(entry.name.padEnd(8, "\0").slice(0, 8)), entryPos + 8);
  }

  return out;
}

const dir = path.join(process.cwd(), "apps/web/public/assets/doomforge/maps");
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
const wadBytes = buildDoomWad();
fs.writeFileSync(path.join(dir, "e1m1_sample.wad"), wadBytes);
console.log("SUCCESS: Generated e1m1_sample.wad with size:", wadBytes.length, "bytes at", path.join(dir, "e1m1_sample.wad"));
