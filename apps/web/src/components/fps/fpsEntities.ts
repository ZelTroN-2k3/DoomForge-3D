import * as THREE from "three";
import type { WorkplaneShape } from "@/types/sketchforge";

export type FpsEntityType =
  | "player_start"
  | "monster_imp"
  | "monster_demon"
  | "pickup_shotgun"
  | "pickup_medikit"
  | "pickup_armor"
  | "pickup_ammo"
  | "prop_barrel"
  | "prop_lamp"
  | "prop_keycard";

export interface FpsEntityDefinition {
  type: FpsEntityType;
  name: string;
  category: "spawn" | "monster" | "pickup" | "prop";
  color: string;
  defaultDimensions: { width: number; depth: number; height: number };
  description: string;
}

export const FPS_ENTITIES: FpsEntityDefinition[] = [
  {
    type: "player_start",
    name: "Player Start",
    category: "spawn",
    color: "#22c55e",
    defaultDimensions: { width: 16, depth: 16, height: 24 },
    description: "Point de départ du joueur avec flèche d'orientation",
  },
  {
    type: "monster_imp",
    name: "Monster: Imp",
    category: "monster",
    color: "#b45309",
    defaultDimensions: { width: 14, depth: 14, height: 26 },
    description: "Monstre humanoïde brun avec pointes et boules de feu",
  },
  {
    type: "monster_demon",
    name: "Monster: Demon",
    category: "monster",
    color: "#e11d48",
    defaultDimensions: { width: 22, depth: 22, height: 28 },
    description: "Démon massif rose/rouge de corps à corps (Pinky)",
  },
  {
    type: "pickup_shotgun",
    name: "Weapon: Shotgun",
    category: "pickup",
    color: "#38bdf8",
    defaultDimensions: { width: 18, depth: 6, height: 6 },
    description: "Fusil à pompe avec cartouches",
  },
  {
    type: "pickup_medikit",
    name: "Pickup: Medikit",
    category: "pickup",
    color: "#f8fafc",
    defaultDimensions: { width: 10, depth: 10, height: 8 },
    description: "Trousse de premiers secours (+25 PV)",
  },
  {
    type: "pickup_armor",
    name: "Pickup: Green Armor",
    category: "pickup",
    color: "#10b981",
    defaultDimensions: { width: 12, depth: 8, height: 14 },
    description: "Gilet pare-balles de sécurité (+50 Armure)",
  },
  {
    type: "pickup_ammo",
    name: "Pickup: Ammo Box",
    category: "pickup",
    color: "#eab308",
    defaultDimensions: { width: 8, depth: 8, height: 8 },
    description: "Boîte de munitions pour fusil (+10 cartouches)",
  },
  {
    type: "prop_barrel",
    name: "Prop: Explosive Barrel",
    category: "prop",
    color: "#84cc16",
    defaultDimensions: { width: 12, depth: 12, height: 20 },
    description: "Baril de déchets toxiques radioactifs explosifs",
  },
  {
    type: "prop_lamp",
    name: "Prop: Tech Light Pillar",
    category: "prop",
    color: "#f59e0b",
    defaultDimensions: { width: 6, depth: 6, height: 32 },
    description: "Colonne technologique lumineuse avec torche jaune",
  },
  {
    type: "prop_keycard",
    name: "Prop: Red Keycard",
    category: "prop",
    color: "#ef4444",
    defaultDimensions: { width: 6, depth: 4, height: 8 },
    description: "Carte d'accès rouge pour portes verrouillées",
  },
];

/** Check if a WorkplaneShape is an FPS entity */
export function getFpsEntityType(shape: WorkplaneShape): FpsEntityType | null {
  const name = shape.name.toLowerCase();
  if (name.includes("player start") || name.startsWith("spawn_")) return "player_start";
  if (name.includes("imp") || name.startsWith("monster_imp")) return "monster_imp";
  if (name.includes("demon") || name.includes("pinky") || name.startsWith("monster_demon")) return "monster_demon";
  if (name.includes("shotgun")) return "pickup_shotgun";
  if (name.includes("medikit") || name.includes("health")) return "pickup_medikit";
  if (name.includes("armor")) return "pickup_armor";
  if (name.includes("ammo")) return "pickup_ammo";
  if (name.includes("barrel")) return "prop_barrel";
  if (name.includes("lamp") || name.includes("light pillar")) return "prop_lamp";
  if (name.includes("keycard") || name.includes("card")) return "prop_keycard";
  return null;
}

/** Create a specialized 3D Three.js visual representation for an FPS entity */
export function createFpsEntityMesh(entityType: FpsEntityType, dimensions = { width: 14, depth: 14, height: 24 }): THREE.Group {
  const group = new THREE.Group();

  switch (entityType) {
    case "player_start": {
      // Circular teleport pad + directional 3D arrow
      const padGeo = new THREE.CylinderGeometry(dimensions.width / 2, dimensions.width / 2, 2, 16);
      const padMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.3, metalness: 0.7 });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.y = 1;
      group.add(pad);

      // Glowing Arrow pointing along -Z (Three.js forward)
      const arrowGeo = new THREE.ConeGeometry(dimensions.width * 0.35, dimensions.height * 0.6, 4);
      const arrowMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x22c55e, emissiveIntensity: 0.6 });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.rotation.x = -Math.PI / 2;
      arrow.rotation.z = Math.PI / 4;
      arrow.position.set(0, dimensions.height * 0.45, -dimensions.depth * 0.2);
      group.add(arrow);

      // Shaft
      const shaftGeo = new THREE.BoxGeometry(4, 3, dimensions.depth * 0.5);
      const shaft = new THREE.Mesh(shaftGeo, arrowMat);
      shaft.position.set(0, dimensions.height * 0.45, dimensions.depth * 0.15);
      group.add(shaft);
      break;
    }

    case "monster_imp": {
      // Spiky humanoid demon
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
      const hornMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xd97706, emissiveIntensity: 0.3 });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

      // Torso
      const torso = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 8), bodyMat);
      torso.position.y = 13;
      group.add(torso);

      // Head
      const head = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 7), bodyMat);
      head.position.set(0, 22, 0);
      group.add(head);

      // Spikes / Horns
      const hornL = new THREE.Mesh(new THREE.ConeGeometry(1.5, 5, 4), hornMat);
      hornL.position.set(-3.5, 26, 0);
      hornL.rotation.z = 0.4;
      group.add(hornL);

      const hornR = new THREE.Mesh(new THREE.ConeGeometry(1.5, 5, 4), hornMat);
      hornR.position.set(3.5, 26, 0);
      hornR.rotation.z = -0.4;
      group.add(hornR);

      // Glowing Eyes
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.5), eyeMat);
      eyeL.position.set(-2, 22.5, -3.6);
      group.add(eyeL);
      const eyeR = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.5), eyeMat);
      eyeR.position.set(2, 22.5, -3.6);
      group.add(eyeR);

      // Legs
      const legGeo = new THREE.BoxGeometry(3.5, 8, 4);
      const legL = new THREE.Mesh(legGeo, bodyMat);
      legL.position.set(-3, 4, 0);
      const legR = new THREE.Mesh(legGeo, bodyMat);
      legR.position.set(3, 4, 0);
      group.add(legL, legR);
      break;
    }

    case "monster_demon": {
      // Massive bulky pink demon (Pinky)
      const skinMat = new THREE.MeshStandardMaterial({ color: 0xbe185d, roughness: 0.7 });
      const hornMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.4 });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

      // Bulky torso
      const torso = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), skinMat);
      torso.position.y = 14;
      group.add(torso);

      // Large head
      const head = new THREE.Mesh(new THREE.BoxGeometry(12, 10, 10), skinMat);
      head.position.set(0, 18, -8);
      group.add(head);

      // Large horns
      const hornL = new THREE.Mesh(new THREE.ConeGeometry(2.5, 8, 4), hornMat);
      hornL.position.set(-6, 23, -8);
      hornL.rotation.z = 0.5;
      hornL.rotation.x = -0.3;
      group.add(hornL);

      const hornR = new THREE.Mesh(new THREE.ConeGeometry(2.5, 8, 4), hornMat);
      hornR.position.set(6, 23, -8);
      hornR.rotation.z = -0.5;
      hornR.rotation.x = -0.3;
      group.add(hornR);

      // Eyes
      const eye = new THREE.Mesh(new THREE.BoxGeometry(10, 1.5, 1), eyeMat);
      eye.position.set(0, 19, -13.2);
      group.add(eye);

      // Massive legs
      const legGeo = new THREE.BoxGeometry(5.5, 8, 6);
      const legL = new THREE.Mesh(legGeo, skinMat);
      legL.position.set(-5, 4, 0);
      const legR = new THREE.Mesh(legGeo, skinMat);
      legR.position.set(5, 4, 0);
      group.add(legL, legR);
      break;
    }

    case "pickup_shotgun": {
      // Metallic floating shotgun
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.9, roughness: 0.2 });
      const stockMat = new THREE.MeshStandardMaterial({ color: 0x713f12, roughness: 0.8 });

      // Twin Barrels
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 14, 8), barrelMat);
      b1.rotation.x = Math.PI / 2;
      b1.position.set(-1, 4, -4);
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 14, 8), barrelMat);
      b2.rotation.x = Math.PI / 2;
      b2.position.set(1, 4, -4);
      group.add(b1, b2);

      // Wooden Stock
      const stock = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4, 8), stockMat);
      stock.position.set(0, 3, 5);
      group.add(stock);

      // Glow pedestal
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0369a1, emissiveIntensity: 0.8 }));
      ped.position.y = 0.25;
      group.add(ped);
      break;
    }

    case "pickup_medikit": {
      // White health box with red cross
      const boxMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 });
      const crossMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.4 });

      const box = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 10), boxMat);
      box.position.y = 4;
      group.add(box);

      // Red Cross on top
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 7), crossMat);
      crossV.position.set(0, 8.15, 0);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(7, 0.2, 2), crossMat);
      crossH.position.set(0, 8.15, 0);
      group.add(crossV, crossH);
      break;
    }

    case "pickup_armor": {
      // Green combat armor vest
      const armorMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, metalness: 0.6, roughness: 0.3, emissive: 0x15803d, emissiveIntensity: 0.3 });
      const chest = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 6), armorMat);
      chest.position.y = 6;
      group.add(chest);

      const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 5), armorMat);
      shoulderL.position.set(-6, 9, 0);
      const shoulderR = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 5), armorMat);
      shoulderR.position.set(6, 9, 0);
      group.add(shoulderL, shoulderR);
      break;
    }

    case "pickup_ammo": {
      // Heavy metal ammo container
      const mat = new THREE.MeshStandardMaterial({ color: 0xca8a04, metalness: 0.7, roughness: 0.3 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(8, 7, 8), mat);
      box.position.y = 3.5;
      group.add(box);

      const handle = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 1.5), new THREE.MeshStandardMaterial({ color: 0x18181b }));
      handle.position.set(0, 7.6, 0);
      group.add(handle);
      break;
    }

    case "prop_barrel": {
      // Radioactive toxic waste barrel with warning stripes
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.5 });
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xa3e635, emissive: 0x4d7c0f, emissiveIntensity: 0.5 });

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 20, 16), barrelMat);
      barrel.position.y = 10;
      group.add(barrel);

      const stripe1 = new THREE.Mesh(new THREE.CylinderGeometry(6.1, 6.1, 2, 16), stripeMat);
      stripe1.position.y = 6;
      const stripe2 = new THREE.Mesh(new THREE.CylinderGeometry(6.1, 6.1, 2, 16), stripeMat);
      stripe2.position.y = 14;
      group.add(stripe1, stripe2);
      break;
    }

    case "prop_lamp": {
      // Tech lamp pillar with intense glowing point light
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.8, roughness: 0.2 });
      const glowMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 1.2 });

      const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 4, 12), pillarMat);
      base.position.y = 2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 24, 12), pillarMat);
      pole.position.y = 16;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 12), glowMat);
      lamp.position.y = 28;
      group.add(base, pole, lamp);
      break;
    }

    case "prop_keycard": {
      // Glowing keycard
      const cardMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xb91c1c, emissiveIntensity: 0.8 });
      const card = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 4), cardMat);
      card.position.y = 4;
      group.add(card);
      break;
    }
  }

  return group;
}
