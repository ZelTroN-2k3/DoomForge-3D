"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import type { WorkplaneShape } from "@/types/sketchforge";
import {
  playShotgunSound,
  playPistolSound,
  playPickupSound,
  playMonsterHitSound,
  playMonsterDeathSound,
  playExplosionSound,
  playDryFireSound,
  playJumpSound,
} from "./synthAudio";
import { getFpsEntityType, createFpsEntityMesh, type FpsEntityType } from "./fpsEntities";

interface PlaytestFpsWorkspaceProps {
  active: boolean;
  shapes: WorkplaneShape[];
  projectName: string;
  onExit: () => void;
}

interface ActiveMonster {
  id: string;
  mesh: THREE.Group;
  type: "monster_imp" | "monster_demon";
  health: number;
  maxHealth: number;
  dead: boolean;
  initialPos: THREE.Vector3;
}

interface ActivePickup {
  id: string;
  mesh: THREE.Group;
  type: "pickup_shotgun" | "pickup_medikit" | "pickup_armor" | "pickup_ammo" | "prop_keycard";
  collected: boolean;
  baseY: number;
}

interface ActiveBarrel {
  id: string;
  mesh: THREE.Group;
  health: number;
  exploded: boolean;
}

export function PlaytestFpsWorkspace({
  active,
  shapes,
  projectName,
  onExit,
}: PlaytestFpsWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

  // Gameplay State
  const [isLocked, setIsLocked] = useState(false);
  const [health, setHealth] = useState(100);
  const [armor, setArmor] = useState(25);
  const [ammo, setAmmo] = useState(18);
  const [activeWeapon, setActiveWeapon] = useState<"pistol" | "shotgun">("shotgun");
  const [hasShotgun, setHasShotgun] = useState(true);
  const [muzzleFlash, setMuzzleFlash] = useState(false);
  const [weaponRecoil, setWeaponRecoil] = useState(false);
  const [hitFeedback, setHitFeedback] = useState<string | null>(null);
  const [killCount, setKillCount] = useState(0);
  const [totalMonsters, setTotalMonsters] = useState(0);
  const [damageFlash, setDamageFlash] = useState(false);

  // References for requestAnimationFrame loop
  const stateRef = useRef({
    active,
    isLocked: false,
    keys: {} as Record<string, boolean>,
    playerPos: new THREE.Vector3(0, 16, 0),
    playerVelocity: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    onGround: true,
    health: 100,
    armor: 25,
    ammo: 18,
    activeWeapon: "shotgun" as "pistol" | "shotgun",
    canShoot: true,
  });

  // Sync active weapon and ammo to stateRef
  useEffect(() => {
    stateRef.current.active = active;
  }, [active]);

  useEffect(() => {
    stateRef.current.health = health;
  }, [health]);

  useEffect(() => {
    stateRef.current.armor = armor;
  }, [armor]);

  useEffect(() => {
    stateRef.current.ammo = ammo;
  }, [ammo]);

  useEffect(() => {
    stateRef.current.activeWeapon = activeWeapon;
  }, [activeWeapon]);

  // Main 3D Playtest Engine Loop
  useEffect(() => {
    if (!active || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    let animFrameId: number;

    // 1. Three.js Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0914);
    scene.fog = new THREE.FogExp2(0x0c0914, 0.0035);

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.5, 1200);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Lighting (Moody Retro Atmosphere)
    const ambientLight = new THREE.AmbientLight(0x40354a, 1.2);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffeedd, 1.4);
    sunLight.position.set(60, 140, 80);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);

    // Red ambient rim light (classic hellish Doom mood)
    const rimLight = new THREE.DirectionalLight(0xb91c1c, 0.8);
    rimLight.position.set(-60, 80, -60);
    scene.add(rimLight);

    // 3. Ground / Floor Plane with procedural retro grid
    const floorSize = 1000;
    const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize, 20, 20);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x181822,
      roughness: 0.85,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor grid lines
    const gridHelper = new THREE.GridHelper(floorSize, 100, 0xff4400, 0x332233);
    gridHelper.position.y = 0.1;
    scene.add(gridHelper);

    // 4. Build Collisions & Scene Objects from `shapes`
    const collisionBoxes: THREE.Box3[] = [];
    const shootableObjects: THREE.Object3D[] = [];
    const activeMonsters: ActiveMonster[] = [];
    const activePickups: ActivePickup[] = [];
    const activeBarrels: ActiveBarrel[] = [];
    let initialSpawn = new THREE.Vector3(0, 16, 40);
    let initialYaw = 0;

    // Build solid bodies
    shapes.forEach((shape) => {
      if (shape.hidden) return;

      const entityType = getFpsEntityType(shape);
      const posX = shape.x ?? 0;
      const posY = (shape.elevation ?? 0) + (shape.height ? shape.height / 2 : 10);
      const posZ = shape.z ?? 0;

      if (entityType) {
        // Specific FPS Entity
        if (entityType === "player_start") {
          initialSpawn.set(posX, (shape.elevation ?? 0) + 16, posZ);
          initialYaw = ((shape.rotation ?? 0) * Math.PI) / 180;
          const marker = createFpsEntityMesh(entityType, { width: shape.width || 16, depth: shape.depth || 16, height: shape.height || 24 });
          marker.position.set(posX, shape.elevation ?? 0, posZ);
          scene.add(marker);
        } else if (entityType === "monster_imp" || entityType === "monster_demon") {
          const monsterMesh = createFpsEntityMesh(entityType, { width: shape.width || 14, depth: shape.depth || 14, height: shape.height || 26 });
          monsterMesh.position.set(posX, shape.elevation ?? 0, posZ);
          scene.add(monsterMesh);

          const hp = entityType === "monster_imp" ? 40 : 85;
          const monsterRecord: ActiveMonster = {
            id: shape.id,
            mesh: monsterMesh,
            type: entityType,
            health: hp,
            maxHealth: hp,
            dead: false,
            initialPos: new THREE.Vector3(posX, shape.elevation ?? 0, posZ),
          };
          activeMonsters.push(monsterRecord);
          // Attach reference to mesh children so raycasting finds it
          monsterMesh.traverse((child) => {
            child.userData = { monsterRecord };
            shootableObjects.push(child);
          });
        } else if (entityType === "prop_barrel") {
          const barrelMesh = createFpsEntityMesh(entityType);
          barrelMesh.position.set(posX, shape.elevation ?? 0, posZ);
          scene.add(barrelMesh);

          const barrelRecord: ActiveBarrel = {
            id: shape.id,
            mesh: barrelMesh,
            health: 20,
            exploded: false,
          };
          activeBarrels.push(barrelRecord);
          barrelMesh.traverse((child) => {
            child.userData = { barrelRecord };
            shootableObjects.push(child);
          });

          // Add collision for barrel
          const barrelBox = new THREE.Box3();
          barrelBox.setFromCenterAndSize(
            new THREE.Vector3(posX, (shape.elevation ?? 0) + 10, posZ),
            new THREE.Vector3(12, 20, 12)
          );
          collisionBoxes.push(barrelBox);
        } else if (entityType === "prop_lamp") {
          const lampMesh = createFpsEntityMesh(entityType);
          lampMesh.position.set(posX, shape.elevation ?? 0, posZ);
          scene.add(lampMesh);

          // Add real light source
          const pLight = new THREE.PointLight(0xf59e0b, 2.5, 90);
          pLight.position.set(posX, (shape.elevation ?? 0) + 28, posZ);
          scene.add(pLight);
        } else {
          // Pickup
          const pickupMesh = createFpsEntityMesh(entityType);
          const baseY = (shape.elevation ?? 0) + 4;
          pickupMesh.position.set(posX, baseY, posZ);
          scene.add(pickupMesh);
          activePickups.push({
            id: shape.id,
            mesh: pickupMesh,
            type: entityType as ActivePickup["type"],
            collected: false,
            baseY,
          });
        }
      } else if (!shape.hole) {
        // Standard Solid Shape (Wall, Pillar, Room Block)
        const width = shape.width ?? 20;
        const depth = shape.depth ?? 20;
        const height = shape.height ?? 20;

        const geo = new THREE.BoxGeometry(width, height, depth);
        const mat = new THREE.MeshStandardMaterial({
          color: shape.color ? new THREE.Color(shape.color) : 0x71717a,
          roughness: 0.65,
          metalness: 0.3,
        });

        const solidMesh = new THREE.Mesh(geo, mat);
        solidMesh.position.set(posX, posY, posZ);
        if (shape.rotation) solidMesh.rotation.y = (shape.rotation * Math.PI) / 180;
        solidMesh.castShadow = true;
        solidMesh.receiveShadow = true;
        scene.add(solidMesh);
        shootableObjects.push(solidMesh);

        // Compute collision bounding box
        const box = new THREE.Box3();
        box.setFromObject(solidMesh);
        collisionBoxes.push(box);
      }
    });

    setTotalMonsters(activeMonsters.length);

    // Initial player state
    stateRef.current.playerPos.copy(initialSpawn);
    stateRef.current.yaw = initialYaw;
    stateRef.current.pitch = 0;
    camera.position.copy(stateRef.current.playerPos);

    // 5. Controls & Listeners
    const onMouseDown = () => {
      if (!document.pointerLockElement) {
        canvas.requestPointerLock();
        return;
      }
      // Shoot!
      handleShoot();
    };

    const handleShoot = () => {
      const state = stateRef.current;
      if (!state.canShoot || state.health <= 0) return;

      if (state.activeWeapon === "shotgun") {
        if (state.ammo <= 0) {
          playDryFireSound();
          return;
        }
        state.ammo -= 1;
        setAmmo(state.ammo);
        playShotgunSound();
        state.canShoot = false;
        setWeaponRecoil(true);
        setMuzzleFlash(true);

        setTimeout(() => setMuzzleFlash(false), 90);
        setTimeout(() => setWeaponRecoil(false), 320);
        setTimeout(() => {
          state.canShoot = true;
        }, 650);

        // Shotgun raycast (multiple pellets with small spread)
        const pelletCount = 6;
        for (let p = 0; p < pelletCount; p++) {
          const spreadX = (Math.random() - 0.5) * 0.045;
          const spreadY = (Math.random() - 0.5) * 0.045;
          fireRay(spreadX, spreadY, 18);
        }
      } else {
        // Pistol
        playPistolSound();
        state.canShoot = false;
        setWeaponRecoil(true);
        setMuzzleFlash(true);

        setTimeout(() => setMuzzleFlash(false), 60);
        setTimeout(() => setWeaponRecoil(false), 180);
        setTimeout(() => {
          state.canShoot = true;
        }, 220);

        fireRay(0, 0, 16);
      }
    };

    const fireRay = (spreadX: number, spreadY: number, damage: number) => {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), camera);

      const intersects = raycaster.intersectObjects(shootableObjects, true);
      if (intersects.length > 0) {
        const hit = intersects[0];
        const hitObj = hit.object;

        // Check monster hit
        const monsterRecord = hitObj.userData?.monsterRecord as ActiveMonster | undefined;
        if (monsterRecord && !monsterRecord.dead) {
          monsterRecord.health -= damage;
          setHitFeedback("HIT!");
          setTimeout(() => setHitFeedback(null), 300);

          if (monsterRecord.health <= 0) {
            monsterRecord.dead = true;
            playMonsterDeathSound();
            setKillCount((prev) => prev + 1);

            // Collapse animation
            monsterRecord.mesh.scale.set(1.2, 0.2, 1.2);
            monsterRecord.mesh.position.y = 1;
          } else {
            playMonsterHitSound();
            // Pain flash
            monsterRecord.mesh.position.y += 1.5;
            setTimeout(() => {
              monsterRecord.mesh.position.y = monsterRecord.initialPos.y;
            }, 80);
          }
          return;
        }

        // Check barrel hit
        const barrelRecord = hitObj.userData?.barrelRecord as ActiveBarrel | undefined;
        if (barrelRecord && !barrelRecord.exploded) {
          barrelRecord.health -= damage;
          if (barrelRecord.health <= 0) {
            barrelRecord.exploded = true;
            playExplosionSound();
            barrelRecord.mesh.visible = false;

            // Explosion flash light
            const expLight = new THREE.PointLight(0xff4400, 8, 80);
            expLight.position.copy(barrelRecord.mesh.position);
            scene.add(expLight);
            setTimeout(() => scene.remove(expLight), 250);

            // Check damage to player if close
            const dist = stateRef.current.playerPos.distanceTo(barrelRecord.mesh.position);
            if (dist < 40) {
              const dmg = Math.floor((40 - dist) * 1.5);
              applyPlayerDamage(dmg);
            }
          }
          return;
        }

        // Wall spark effect
        const spark = new THREE.PointLight(0xffaa00, 3, 15);
        spark.position.copy(hit.point);
        scene.add(spark);
        setTimeout(() => scene.remove(spark), 100);
      }
    };

    const applyPlayerDamage = (amount: number) => {
      const state = stateRef.current;
      if (state.health <= 0) return;

      let remaining = amount;
      if (state.armor > 0) {
        const armorAbsorb = Math.min(state.armor, Math.floor(amount * 0.6));
        state.armor -= armorAbsorb;
        remaining -= armorAbsorb;
        setArmor(state.armor);
      }

      state.health = Math.max(0, state.health - remaining);
      setHealth(state.health);
      setDamageFlash(true);
      setTimeout(() => setDamageFlash(false), 200);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      const sensitivity = 0.0024;
      stateRef.current.yaw -= e.movementX * sensitivity;
      stateRef.current.pitch -= e.movementY * sensitivity;

      // Clamp pitch (-85 to +85 degrees)
      const maxPitch = (85 * Math.PI) / 180;
      stateRef.current.pitch = Math.max(-maxPitch, Math.min(maxPitch, stateRef.current.pitch));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      stateRef.current.keys[e.code] = true;
      if (e.code === "Digit1") {
        setActiveWeapon("pistol");
      } else if (e.code === "Digit2" && hasShotgun) {
        setActiveWeapon("shotgun");
      } else if (e.code === "Space" && stateRef.current.onGround) {
        stateRef.current.playerVelocity.y = 52;
        stateRef.current.onGround = false;
        playJumpSound();
      } else if (e.code === "Escape") {
        onExit();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      stateRef.current.keys[e.code] = false;
    };

    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      setIsLocked(locked);
      stateRef.current.isLocked = locked;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerlockchange", onLockChange);

    // 6. Animation and Physics Loop
    let lastTime = performance.now();

    const loop = (time: number) => {
      animFrameId = requestAnimationFrame(loop);
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const state = stateRef.current;

      // Pickups floating animation & collection check
      activePickups.forEach((pickup) => {
        if (pickup.collected) return;
        pickup.mesh.rotation.y += dt * 2.2;
        pickup.mesh.position.y = pickup.baseY + Math.sin(time * 0.004) * 2;

        // Player collection distance check
        const dist = state.playerPos.distanceTo(pickup.mesh.position);
        if (dist < 18) {
          pickup.collected = true;
          pickup.mesh.visible = false;
          playPickupSound();

          if (pickup.type === "pickup_shotgun") {
            setHasShotgun(true);
            setActiveWeapon("shotgun");
            state.ammo += 12;
            setAmmo(state.ammo);
            setHitFeedback("+12 SHELLS & SHOTGUN!");
          } else if (pickup.type === "pickup_medikit") {
            state.health = Math.min(100, state.health + 25);
            setHealth(state.health);
            setHitFeedback("+25 HEALTH");
          } else if (pickup.type === "pickup_armor") {
            state.armor = Math.min(100, state.armor + 50);
            setArmor(state.armor);
            setHitFeedback("+50 ARMOR");
          } else if (pickup.type === "pickup_ammo") {
            state.ammo += 10;
            setAmmo(state.ammo);
            setHitFeedback("+10 AMMO");
          }
          setTimeout(() => setHitFeedback(null), 1200);
        }
      });

      // Monster behavior (face player & attack when close)
      activeMonsters.forEach((mon) => {
        if (mon.dead) return;
        mon.mesh.lookAt(state.playerPos.x, mon.mesh.position.y, state.playerPos.z);

        const dist = state.playerPos.distanceTo(mon.mesh.position);
        if (dist < 120 && dist > 18) {
          // Slowly move towards player
          const dir = new THREE.Vector3().subVectors(state.playerPos, mon.mesh.position).normalize();
          mon.mesh.position.x += dir.x * dt * 14;
          mon.mesh.position.z += dir.z * dt * 14;
        } else if (dist <= 18) {
          // Melee attack player
          if (Math.random() < 0.02) {
            applyPlayerDamage(mon.type === "monster_imp" ? 8 : 16);
          }
        }
      });

      // Player Movement Logic
      if (state.isLocked && state.health > 0) {
        const speed = state.keys["ShiftLeft"] || state.keys["ShiftRight"] ? 80 : 48;
        const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
        const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));

        const moveDir = new THREE.Vector3(0, 0, 0);

        // ZQSD / WASD
        if (state.keys["KeyW"] || state.keys["KeyZ"]) moveDir.add(forward);
        if (state.keys["KeyS"]) moveDir.sub(forward);
        if (state.keys["KeyA"] || state.keys["KeyQ"]) moveDir.sub(right);
        if (state.keys["KeyD"]) moveDir.add(right);

        if (moveDir.lengthSq() > 0) {
          moveDir.normalize();
          state.playerVelocity.x = moveDir.x * speed;
          state.playerVelocity.z = moveDir.z * speed;
        } else {
          state.playerVelocity.x *= Math.exp(-dt * 12);
          state.playerVelocity.z *= Math.exp(-dt * 12);
        }

        // Apply Gravity
        state.playerVelocity.y -= 130 * dt;

        // Proposed new position
        const nextPos = state.playerPos.clone();
        nextPos.x += state.playerVelocity.x * dt;
        nextPos.z += state.playerVelocity.z * dt;
        nextPos.y += state.playerVelocity.y * dt;

        // Floor collision at y=16 (eye level)
        if (nextPos.y <= 16) {
          nextPos.y = 16;
          state.playerVelocity.y = 0;
          state.onGround = true;
        }

        // Horizontal Wall Collision Checks
        const playerRadius = 7;
        const playerHeight = 24;
        const playerBox = new THREE.Box3(
          new THREE.Vector3(nextPos.x - playerRadius, nextPos.y - 14, nextPos.z - playerRadius),
          new THREE.Vector3(nextPos.x + playerRadius, nextPos.y + 10, nextPos.z + playerRadius)
        );

        let collision = false;
        for (const box of collisionBoxes) {
          if (playerBox.intersectsBox(box)) {
            collision = true;
            // Slide along axes
            const testXBox = playerBox.clone().translate(new THREE.Vector3(0, 0, -(nextPos.z - state.playerPos.z)));
            if (!testXBox.intersectsBox(box)) {
              nextPos.z = state.playerPos.z;
              collision = false;
              break;
            }
            const testZBox = playerBox.clone().translate(new THREE.Vector3(-(nextPos.x - state.playerPos.x), 0, 0));
            if (!testZBox.intersectsBox(box)) {
              nextPos.x = state.playerPos.x;
              collision = false;
              break;
            }
            break;
          }
        }

        if (!collision) {
          state.playerPos.copy(nextPos);
        }

        // Camera positioning & head bobbing
        let bobY = 0;
        if (state.onGround && moveDir.lengthSq() > 0) {
          bobY = Math.sin(time * 0.015) * 0.8;
        }
        camera.position.set(state.playerPos.x, state.playerPos.y + bobY, state.playerPos.z);

        // Update Camera Rotation via Euler
        const euler = new THREE.Euler(0, 0, 0, "YXZ");
        euler.x = state.pitch;
        euler.y = state.yaw;
        camera.quaternion.setFromEuler(euler);
      }

      // Render 3D Scene
      renderer.render(scene, camera);

      // Render 2D Minimap Radar
      if (minimapCanvasRef.current) {
        const miniCtx = minimapCanvasRef.current.getContext("2d");
        if (miniCtx) {
          const mw = 140;
          const mh = 140;
          miniCtx.clearRect(0, 0, mw, mh);

          // Radar background
          miniCtx.fillStyle = "rgba(10, 8, 16, 0.75)";
          miniCtx.fillRect(0, 0, mw, mh);
          miniCtx.strokeStyle = "#ff4400";
          miniCtx.lineWidth = 1.5;
          miniCtx.strokeRect(0, 0, mw, mh);

          const centerX = mw / 2;
          const centerY = mh / 2;
          const scale = 0.45;

          // Draw walls / collision boxes
          miniCtx.fillStyle = "#555566";
          for (const box of collisionBoxes) {
            const bx = centerX + (box.min.x - state.playerPos.x) * scale;
            const bz = centerY + (box.min.z - state.playerPos.z) * scale;
            const bw = (box.max.x - box.min.x) * scale;
            const bh = (box.max.z - box.min.z) * scale;
            miniCtx.fillRect(bx, bz, bw, bh);
          }

          // Draw monsters (Red dots)
          miniCtx.fillStyle = "#ef4444";
          activeMonsters.forEach((mon) => {
            if (mon.dead) return;
            const mx = centerX + (mon.mesh.position.x - state.playerPos.x) * scale;
            const mz = centerY + (mon.mesh.position.z - state.playerPos.z) * scale;
            if (mx >= 0 && mx <= mw && mz >= 0 && mz <= mh) {
              miniCtx.beginPath();
              miniCtx.arc(mx, mz, 2.5, 0, Math.PI * 2);
              miniCtx.fill();
            }
          });

          // Draw pickups (Cyan dots)
          miniCtx.fillStyle = "#38bdf8";
          activePickups.forEach((pic) => {
            if (pic.collected) return;
            const px = centerX + (pic.mesh.position.x - state.playerPos.x) * scale;
            const pz = centerY + (pic.mesh.position.z - state.playerPos.z) * scale;
            if (px >= 0 && px <= mw && pz >= 0 && pz <= mh) {
              miniCtx.fillRect(px - 1.5, pz - 1.5, 3, 3);
            }
          });

          // Draw Player (Green circle + sight cone)
          miniCtx.fillStyle = "#22c55e";
          miniCtx.beginPath();
          miniCtx.arc(centerX, centerY, 3.5, 0, Math.PI * 2);
          miniCtx.fill();

          miniCtx.strokeStyle = "#22c55e";
          miniCtx.lineWidth = 2;
          miniCtx.beginPath();
          miniCtx.moveTo(centerX, centerY);
          miniCtx.lineTo(centerX - Math.sin(state.yaw) * 12, centerY - Math.cos(state.yaw) * 12);
          miniCtx.stroke();
        }
      }
    };

    animFrameId = requestAnimationFrame(loop);

    // Resize handler
    const onResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("pointerlockchange", onLockChange);
      renderer.dispose();
    };
  }, [active, shapes, onExit, hasShotgun]);

  if (!active) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        backgroundColor: "#000",
        userSelect: "none",
        overflow: "hidden",
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      {/* 3D WebGL Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", cursor: isLocked ? "none" : "pointer" }}
      />

      {/* Top Banner & Exit Button */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 16,
          right: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pointerEvents: "none",
          zIndex: 120,
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(18, 10, 16, 0.85)",
            border: "2px solid #ff4400",
            borderRadius: 6,
            padding: "6px 14px",
            color: "#ffeedd",
            fontSize: 13,
            fontWeight: "bold",
            letterSpacing: 1,
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 0 15px rgba(255, 68, 0, 0.4)",
          }}
        >
          <span style={{ color: "#ff4400" }}>▶ DOOMFORGE 3D PLAYTEST</span>
          <span>•</span>
          <span>{projectName}</span>
          <span>•</span>
          <span>KILLS: {killCount} / {totalMonsters}</span>
        </div>

        <button
          type="button"
          onClick={onExit}
          style={{
            pointerEvents: "auto",
            backgroundColor: "#dc2626",
            border: "2px solid #f87171",
            color: "#ffffff",
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: "bold",
            borderRadius: 6,
            cursor: "pointer",
            boxShadow: "0 0 12px rgba(220, 38, 38, 0.6)",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          ✕ Quitter Playtest (Échap)
        </button>
      </div>

      {/* Minimap Radar Top-Right */}
      <div
        style={{
          position: "absolute",
          top: 60,
          right: 16,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
        }}
      >
        <canvas
          ref={minimapCanvasRef}
          width={140}
          height={140}
          style={{
            borderRadius: 6,
            boxShadow: "0 0 10px rgba(0, 0, 0, 0.8)",
          }}
        />
        <span style={{ color: "#ffaa00", fontSize: 10, marginTop: 4, letterSpacing: 1 }}>RADAR TACTIQUE</span>
      </div>

      {/* Damage Flash Overlay */}
      {damageFlash && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(220, 38, 38, 0.35)",
            pointerEvents: "none",
            transition: "opacity 0.2s",
          }}
        />
      )}

      {/* Central Crosshair */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="2" fill="#ff4400" />
          <line x1="16" y1="6" x2="16" y2="11" stroke="#ff4400" strokeWidth="2" />
          <line x1="16" y1="21" x2="16" y2="26" stroke="#ff4400" strokeWidth="2" />
          <line x1="6" y1="16" x2="11" y2="16" stroke="#ff4400" strokeWidth="2" />
          <line x1="21" y1="16" x2="26" y2="16" stroke="#ff4400" strokeWidth="2" />
        </svg>
      </div>

      {/* Hit Feedback Text */}
      {hitFeedback && (
        <div
          style={{
            position: "absolute",
            top: "42%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#facc15",
            fontSize: 18,
            fontWeight: "900",
            letterSpacing: 2,
            textShadow: "0 0 10px #000, 0 0 6px #ff4400",
            pointerEvents: "none",
          }}
        >
          {hitFeedback}
        </div>
      )}

      {/* Weapon Viewmodel in Hand */}
      <div
        style={{
          position: "absolute",
          bottom: 74,
          left: "50%",
          transform: `translateX(-50%) translateY(${weaponRecoil ? "28px" : "0px"})`,
          transition: "transform 0.08s ease-out",
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Muzzle Flash Glow */}
        {muzzleFlash && (
          <div
            style={{
              width: 130,
              height: 130,
              borderRadius: "50%",
              background: "radial-gradient(circle, #fff 0%, #ffaa00 45%, #ff2200 70%, transparent 85%)",
              marginBottom: -40,
              filter: "blur(2px)",
              opacity: 0.95,
            }}
          />
        )}

        {/* 2.5D Retro Weapon Sprite Representation */}
        {activeWeapon === "shotgun" ? (
          <svg width="190" height="150" viewBox="0 0 190 150">
            {/* Twin Shotgun Steel Barrels */}
            <rect x="74" y="20" width="18" height="90" fill="#27272a" stroke="#18181b" strokeWidth="2" />
            <rect x="98" y="20" width="18" height="90" fill="#27272a" stroke="#18181b" strokeWidth="2" />
            {/* Highlights */}
            <rect x="78" y="22" width="4" height="86" fill="#71717a" />
            <rect x="102" y="22" width="4" height="86" fill="#71717a" />
            {/* Barrel Holes */}
            <ellipse cx="83" cy="22" rx="7" ry="4" fill="#09090b" stroke="#3f3f46" strokeWidth="1.5" />
            <ellipse cx="107" cy="22" rx="7" ry="4" fill="#09090b" stroke="#3f3f46" strokeWidth="1.5" />
            {/* Pump Fore-end */}
            <rect x="68" y="80" width="54" height="34" rx="4" fill="#78350f" stroke="#451a03" strokeWidth="2" />
            <line x1="72" y1="90" x2="118" y2="90" stroke="#451a03" strokeWidth="2" />
            <line x1="72" y1="100" x2="118" y2="100" stroke="#451a03" strokeWidth="2" />
            {/* Hands */}
            <ellipse cx="60" cy="115" rx="14" ry="10" fill="#ea580c" />
            <ellipse cx="130" cy="115" rx="14" ry="10" fill="#ea580c" />
          </svg>
        ) : (
          <svg width="130" height="130" viewBox="0 0 130 130">
            {/* Pistol Slide */}
            <rect x="52" y="30" width="26" height="65" fill="#3f3f46" stroke="#18181b" strokeWidth="2" />
            <rect x="56" y="32" width="5" height="60" fill="#71717a" />
            <ellipse cx="65" cy="32" rx="5" ry="3" fill="#09090b" />
            {/* Grip & Hand */}
            <rect x="55" y="80" width="20" height="30" fill="#78350f" />
            <ellipse cx="65" cy="100" rx="16" ry="12" fill="#ea580c" />
          </svg>
        )}
      </div>

      {/* Classic Doom-style Retro Status Bar at the Bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 74,
          backgroundColor: "#1c1822",
          borderTop: "4px solid #ff4400",
          boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.9)",
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
          padding: "4px 12px",
          gap: 12,
          zIndex: 60,
        }}
      >
        {/* AMMO Block */}
        <div
          style={{
            flex: "1",
            maxWidth: 150,
            backgroundColor: "#0d0912",
            border: "2px solid #443344",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: "bold", letterSpacing: 1 }}>AMMO</span>
          <span style={{ color: ammo > 5 ? "#eab308" : "#ef4444", fontSize: 28, fontWeight: "900", lineHeight: 1 }}>
            {activeWeapon === "shotgun" ? ammo : "∞"}
          </span>
        </div>

        {/* HEALTH Block */}
        <div
          style={{
            flex: "1",
            maxWidth: 160,
            backgroundColor: "#0d0912",
            border: "2px solid #443344",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: "bold", letterSpacing: 1 }}>HEALTH</span>
          <span
            style={{
              color: health > 50 ? "#22c55e" : health > 25 ? "#f59e0b" : "#dc2626",
              fontSize: 28,
              fontWeight: "900",
              lineHeight: 1,
            }}
          >
            {health}%
          </span>
        </div>

        {/* MUGSHOT RETRO FACE AVATAR */}
        <div
          style={{
            width: 74,
            backgroundColor: "#2e1f2f",
            border: "2px solid #ff4400",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            position: "relative",
          }}
        >
          <svg width="56" height="56" viewBox="0 0 56 56">
            {/* Marine Face */}
            <circle cx="28" cy="28" r="22" fill={health > 0 ? "#fbcfe8" : "#94a3b8"} stroke="#451a03" strokeWidth="2" />
            {/* Helmet / Hair */}
            <path d="M12,24 C14,10 42,10 44,24 Z" fill="#713f12" />
            {/* Eyes */}
            {health > 0 ? (
              <>
                <ellipse cx="21" cy="26" rx="3.5" ry="3" fill="#fff" />
                <circle cx={muzzleFlash ? "22" : "21"} cy="26" r="1.8" fill="#000" />
                <ellipse cx="35" cy="26" rx="3.5" ry="3" fill="#fff" />
                <circle cx={muzzleFlash ? "36" : "35"} cy="26" r="1.8" fill="#000" />
                {/* Mouth */}
                {muzzleFlash ? (
                  <path d="M22,38 Q28,44 34,38" fill="none" stroke="#7f1d1d" strokeWidth="3" />
                ) : (
                  <line x1="22" y1="38" x2="34" y2="38" stroke="#451a03" strokeWidth="2.5" />
                )}
              </>
            ) : (
              <>
                {/* Dead X Eyes */}
                <line x1="17" y1="22" x2="25" y2="30" stroke="#b91c1c" strokeWidth="2.5" />
                <line x1="25" y1="22" x2="17" y2="30" stroke="#b91c1c" strokeWidth="2.5" />
                <line x1="31" y1="22" x2="39" y2="30" stroke="#b91c1c" strokeWidth="2.5" />
                <line x1="39" y1="22" x2="31" y2="30" stroke="#b91c1c" strokeWidth="2.5" />
              </>
            )}
          </svg>
        </div>

        {/* ARMOR Block */}
        <div
          style={{
            flex: "1",
            maxWidth: 160,
            backgroundColor: "#0d0912",
            border: "2px solid #443344",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: "bold", letterSpacing: 1 }}>ARMOR</span>
          <span style={{ color: "#38bdf8", fontSize: 28, fontWeight: "900", lineHeight: 1 }}>
            {armor}%
          </span>
        </div>

        {/* WEAPONS Slot Selector */}
        <div
          style={{
            flex: "1",
            maxWidth: 170,
            backgroundColor: "#0d0912",
            border: "2px solid #443344",
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
            padding: "0 8px",
          }}
        >
          <div
            style={{
              padding: "4px 8px",
              border: activeWeapon === "pistol" ? "1.5px solid #ff4400" : "1px solid #332233",
              backgroundColor: activeWeapon === "pistol" ? "#2a1515" : "transparent",
              color: activeWeapon === "pistol" ? "#ff4400" : "#6b7280",
              fontWeight: "bold",
              fontSize: 12,
              borderRadius: 4,
            }}
          >
            1: PISTOL
          </div>
          <div
            style={{
              padding: "4px 8px",
              border: activeWeapon === "shotgun" ? "1.5px solid #ff4400" : "1px solid #332233",
              backgroundColor: activeWeapon === "shotgun" ? "#2a1515" : "transparent",
              color: activeWeapon === "shotgun" ? "#ff4400" : "#6b7280",
              fontWeight: "bold",
              fontSize: 12,
              borderRadius: 4,
            }}
          >
            2: SHOTGUN
          </div>
        </div>
      </div>

      {/* Click-to-Play Overlay (when Pointer Lock is not engaged) */}
      {!isLocked && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(10, 8, 16, 0.88)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            color: "#fff",
            zIndex: 100,
            cursor: "pointer",
          }}
          onClick={() => canvasRef.current?.requestPointerLock()}
        >
          <div
            style={{
              border: "3px solid #ff4400",
              borderRadius: 12,
              padding: "36px 48px",
              backgroundColor: "rgba(22, 12, 18, 0.95)",
              textAlign: "center",
              boxShadow: "0 0 35px rgba(255, 68, 0, 0.5)",
              maxWidth: 580,
            }}
          >
            <h1
              style={{
                fontSize: 32,
                fontWeight: 900,
                color: "#ff4400",
                marginBottom: 8,
                letterSpacing: 3,
                textTransform: "uppercase",
              }}
            >
              Mode Playtest FPS
            </h1>
            <p style={{ fontSize: 16, color: "#d1d5db", marginBottom: 24 }}>
              Explorez votre monde en vue première personne comme dans Doom !
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                textAlign: "left",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                padding: 16,
                borderRadius: 8,
                marginBottom: 24,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <div>
                <strong style={{ color: "#ffaa00" }}>ZQSD / WASD :</strong> Se déplacer<br />
                <strong style={{ color: "#ffaa00" }}>Souris :</strong> Viser / Regarder à 360°<br />
                <strong style={{ color: "#ffaa00" }}>Espace :</strong> Sauter
              </div>
              <div>
                <strong style={{ color: "#ffaa00" }}>Clic Gauche :</strong> Tirer<br />
                <strong style={{ color: "#ffaa00" }}>1 / 2 :</strong> Changer d'arme<br />
                <strong style={{ color: "#ffaa00" }}>Échap :</strong> Quitter le playtest
              </div>
            </div>

            <button
              type="button"
              style={{
                backgroundColor: "#ff4400",
                color: "#fff",
                border: "none",
                padding: "14px 32px",
                fontSize: 16,
                fontWeight: 900,
                borderRadius: 6,
                letterSpacing: 2,
                cursor: "pointer",
                boxShadow: "0 0 20px rgba(255, 68, 0, 0.7)",
              }}
            >
              CLIQUEZ POUR COMMENCER
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
