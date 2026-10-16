"use client";

import React, { useState } from "react";
import type { WorkplaneShape } from "@/types/sketchforge";
import { getFpsEntityType } from "./fpsEntities";
import { X, Download, Code, Globe, Box } from "lucide-react";

interface FpsExportModalProps {
  open: boolean;
  shapes: WorkplaneShape[];
  projectName: string;
  onClose: () => void;
}

export function FpsExportModal({ open, shapes, projectName, onClose }: FpsExportModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  // Generate Map Manifest JSON
  const generateMapJson = () => {
    let playerStart = { x: 0, y: 16, z: 0, rotation: 0 };
    const entities: Array<{
      id: string;
      type: string;
      name: string;
      x: number;
      y: number;
      z: number;
      rotation: number;
      width: number;
      depth: number;
      height: number;
    }> = [];
    const solids: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      z: number;
      width: number;
      depth: number;
      height: number;
      rotation: number;
      color: string;
    }> = [];

    shapes.forEach((shape) => {
      if (shape.hidden) return;
      const entityType = getFpsEntityType(shape);
      const posX = shape.x ?? 0;
      const posY = shape.elevation ?? 0;
      const posZ = shape.z ?? 0;

      if (entityType === "player_start") {
        playerStart = { x: posX, y: posY + 16, z: posZ, rotation: shape.rotation ?? 0 };
      } else if (entityType) {
        entities.push({
          id: shape.id,
          type: entityType,
          name: shape.name,
          x: posX,
          y: posY,
          z: posZ,
          rotation: shape.rotation ?? 0,
          width: shape.width ?? 16,
          depth: shape.depth ?? 16,
          height: shape.height ?? 24,
        });
      } else if (!shape.hole) {
        solids.push({
          id: shape.id,
          name: shape.name,
          x: posX,
          y: posY,
          z: posZ,
          width: shape.width ?? 20,
          depth: shape.depth ?? 20,
          height: shape.height ?? 20,
          rotation: shape.rotation ?? 0,
          color: shape.color ?? "#71717a",
        });
      }
    });

    const manifest = {
      engine: "DoomForge 3D",
      version: "1.0",
      mapName: projectName || "DoomForge Map",
      createdAt: new Date().toISOString(),
      playerStart,
      stats: {
        totalSolids: solids.length,
        totalEntities: entities.length,
      },
      entities,
      solids,
    };

    return JSON.stringify(manifest, null, 2);
  };

  const downloadJson = () => {
    const jsonStr = generateMapJson();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName || "map"}-doomforge.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = () => {
    const jsonStr = generateMapJson();
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadStandaloneHtml = () => {
    const jsonStr = generateMapJson();
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${projectName || "DoomForge 3D"} - Standalone Game</title>
  <style>
    body { margin: 0; overflow: hidden; background: #000; font-family: monospace; }
    #overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; flex-direction: column; justify-content: center; align-items: center; color: #ff4400; z-index: 100; cursor: pointer; }
    #hud { position: fixed; bottom: 0; left: 0; right: 0; height: 60px; background: #1c1822; border-top: 3px solid #ff4400; display: flex; justify-content: space-around; align-items: center; color: #fff; font-size: 20px; font-weight: bold; }
    #crosshair { position: fixed; top: 50%; left: 50%; width: 10px; height: 10px; transform: translate(-50%, -50%); border: 2px solid #ff4400; border-radius: 50%; pointer-events: none; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
  <div id="crosshair"></div>
  <div id="overlay">
    <h1>${projectName || "DOOMFORGE LEVEL"}</h1>
    <p>Cliquez pour jouer (ZQSD / WASD + Souris pour viser)</p>
  </div>
  <div id="hud">
    <span>SANTÉ: 100%</span>
    <span>ARMURE: 25%</span>
    <span>MUNITIONS: 24</span>
  </div>
  <script>
    const mapData = ${jsonStr};
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0812);
    scene.fog = new THREE.FogExp2(0x0a0812, 0.005);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const amb = new THREE.AmbientLight(0x554455); scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffeedd, 1.2); dir.position.set(50, 100, 50); scene.add(dir);

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ color: 0x181824 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const grid = new THREE.GridHelper(1000, 100, 0xff4400, 0x332233); scene.add(grid);

    // Solids
    mapData.solids.forEach(s => {
      const geo = new THREE.BoxGeometry(s.width, s.height, s.depth);
      const mat = new THREE.MeshStandardMaterial({ color: s.color });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(s.x, s.y + s.height / 2, s.z);
      if (s.rotation) m.rotation.y = s.rotation * Math.PI / 180;
      scene.add(m);
    });

    // Player
    camera.position.set(mapData.playerStart.x, mapData.playerStart.y, mapData.playerStart.z);
    let yaw = mapData.playerStart.rotation * Math.PI / 180, pitch = 0;
    const keys = {};
    window.addEventListener("keydown", e => keys[e.code] = true);
    window.addEventListener("keyup", e => keys[e.code] = false);
    document.getElementById("overlay").addEventListener("click", () => {
      document.body.requestPointerLock();
      document.getElementById("overlay").style.display = "none";
    });
    window.addEventListener("mousemove", e => {
      if (document.pointerLockElement === document.body) {
        yaw -= e.movementX * 0.0025;
        pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * 0.0025));
      }
    });

    function loop() {
      requestAnimationFrame(loop);
      if (document.pointerLockElement === document.body) {
        const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const rgt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        if (keys["KeyW"] || keys["KeyZ"]) camera.position.addScaledVector(fwd, 1.2);
        if (keys["KeyS"]) camera.position.addScaledVector(fwd, -1.2);
        if (keys["KeyA"] || keys["KeyQ"]) camera.position.addScaledVector(rgt, -1.2);
        if (keys["KeyD"]) camera.position.addScaledVector(rgt, 1.2);
        const euler = new THREE.Euler(pitch, yaw, 0, "YXZ");
        camera.quaternion.setFromEuler(euler);
      }
      renderer.render(scene, camera);
    }
    loop();
  </script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName || "game"}-standalone.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          backgroundColor: "#16101c",
          border: "2px solid #ff4400",
          borderRadius: 10,
          width: "100%",
          maxWidth: 600,
          padding: 24,
          color: "#fff",
          boxShadow: "0 0 30px rgba(255, 68, 0, 0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, color: "#ff4400", fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>
            EXPORTATION DU NIVEAU FPS
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}
          >
            <X size={24} />
          </button>
        </div>

        <p style={{ color: "#d1d5db", fontSize: 14, marginBottom: 20 }}>
          Exportez votre monde pour l'utiliser dans votre propre moteur de jeu (Three.js, Godot, Unity, Unreal) ou jouez-y immédiatement.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* JSON Manifest Button */}
          <div
            style={{
              backgroundColor: "#201728",
              border: "1px solid #3d2a4d",
              borderRadius: 8,
              padding: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong style={{ display: "block", color: "#ffaa00", fontSize: 15 }}>Manifeste de Niveau JSON (.json)</strong>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>
                Positions des spawns, ennemis, pickups, lumières et blocs de collision.
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={copyJson}
                style={{
                  backgroundColor: "#374151",
                  border: "none",
                  color: "#fff",
                  padding: "8px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {copied ? "Copié !" : "Copier"}
              </button>
              <button
                type="button"
                onClick={downloadJson}
                style={{
                  backgroundColor: "#ff4400",
                  border: "none",
                  color: "#fff",
                  padding: "8px 14px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                }}
              >
                <Download size={14} /> Télécharger
              </button>
            </div>
          </div>

          {/* Standalone HTML Game */}
          <div
            style={{
              backgroundColor: "#201728",
              border: "1px solid #3d2a4d",
              borderRadius: 8,
              padding: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong style={{ display: "block", color: "#38bdf8", fontSize: 15 }}>Jeu Web Autonome (.html)</strong>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>
                Un fichier HTML tout-en-un jouable dans n'importe quel navigateur sans installation.
              </span>
            </div>
            <button
              type="button"
              onClick={downloadStandaloneHtml}
              style={{
                backgroundColor: "#0284c7",
                border: "none",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
              }}
            >
              <Globe size={14} /> Exporter HTML
            </button>
          </div>
        </div>

        <div style={{ marginTop: 24, textAlign: "right" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: "#4b5563",
              border: "none",
              color: "#fff",
              padding: "10px 20px",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
