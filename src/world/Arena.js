import * as THREE from "three";
import { GAME_CONFIG } from "../../shared/config.js";

export function createArena(scene) {
  const textures = createProceduralTextures();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(GAME_CONFIG.arena.width, GAME_CONFIG.arena.depth, 1, 1),
    new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  addLights(scene);
  addWalls(scene, textures);
  const coverMeshes = GAME_CONFIG.cover.map((item) => addCover(scene, item, textures));
  const impacts = [];

  return {
    colliders: GAME_CONFIG.cover,
    showImpact(point, part) {
      const color = part === "head"
        ? 0xff3b30
        : part === "torso"
          ? 0xffb703
          : part === "cover"
            ? 0xffd6a3
            : 0x9bdcff;
      const impact = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 10),
        new THREE.MeshBasicMaterial({ color })
      );
      impact.position.set(point.x, point.y, point.z);
      impact.life = 0.45;
      impacts.push(impact);
      scene.add(impact);
      setTimeout(() => {
        scene.remove(impact);
        impact.geometry.dispose();
        impact.material.dispose();
      }, 450);
    },
    coverMeshes
  };
}

function addLights(scene) {
  const ambient = new THREE.HemisphereLight(0xc1c0b8, 0x1b1714, 1.1);
  scene.add(ambient);

  const spots = [
    [-11, 5.4, -7],
    [11, 5.4, 7],
    [0, 5.1, 0],
    [-4, 5.0, 9],
    [4, 5.0, -9]
  ];
  for (const [x, y, z] of spots) {
    const light = new THREE.PointLight(0xffe1b0, 38, 16, 1.8);
    light.position.set(x, y, z);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    scene.add(light);

    const fixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 0.18, 18),
      new THREE.MeshStandardMaterial({ color: 0x36302a, roughness: 0.6, metalness: 0.5 })
    );
    fixture.position.set(x, y + 0.15, z);
    scene.add(fixture);
  }
}

function addWalls(scene, textures) {
  const wallMaterial = new THREE.MeshStandardMaterial({ map: textures.rust, roughness: 0.86, metalness: 0.35 });
  const concrete = new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.96 });
  const w = GAME_CONFIG.arena.width;
  const d = GAME_CONFIG.arena.depth;
  const h = GAME_CONFIG.arena.wallHeight;
  const specs = [
    [0, h / 2, -d / 2, w, h, 0.35, wallMaterial],
    [0, h / 2, d / 2, w, h, 0.35, wallMaterial],
    [-w / 2, h / 2, 0, 0.35, h, d, concrete],
    [w / 2, h / 2, 0, 0.35, h, d, concrete]
  ];
  for (const [x, y, z, sx, sy, sz, material] of specs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    wall.position.set(x, y, z);
    wall.receiveShadow = true;
    wall.castShadow = true;
    scene.add(wall);
  }
}

function addCover(scene, item, textures) {
  const material = item.type === "crate"
    ? new THREE.MeshStandardMaterial({ map: textures.crate, roughness: 0.8, metalness: 0.2 })
    : item.type === "pillar" || item.type === "concrete"
      ? new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.94 })
      : new THREE.MeshStandardMaterial({ map: textures.rust, roughness: 0.82, metalness: 0.28 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(item.w, item.h, item.d), material);
  mesh.position.set(item.x, item.h / 2, item.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function createProceduralTextures() {
  return {
    concrete: makeTexture((ctx, size) => {
      ctx.fillStyle = "#5a5951";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 900; i += 1) {
        const v = 70 + Math.random() * 70;
        ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.18})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, Math.random() * 5, Math.random() * 5);
      }
      ctx.strokeStyle = "rgba(35,32,28,.25)";
      for (let x = 0; x < size; x += 64) line(ctx, x, 0, x, size);
      for (let y = 0; y < size; y += 64) line(ctx, 0, y, size, y);
    }),
    rust: makeTexture((ctx, size) => {
      ctx.fillStyle = "#5c4232";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 1200; i += 1) {
        ctx.fillStyle = Math.random() > 0.55 ? "rgba(143,67,32,.28)" : "rgba(38,34,31,.22)";
        ctx.fillRect(Math.random() * size, Math.random() * size, Math.random() * 14, Math.random() * 4);
      }
      ctx.strokeStyle = "rgba(230,160,90,.18)";
      for (let y = 18; y < size; y += 42) line(ctx, 0, y, size, y);
    }),
    crate: makeTexture((ctx, size) => {
      ctx.fillStyle = "#6b4d36";
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = "rgba(30,24,18,.45)";
      ctx.lineWidth = 5;
      for (let y = 24; y < size; y += 42) line(ctx, 0, y, size, y);
      line(ctx, 0, 0, size, size);
      line(ctx, size, 0, 0, size);
    })
  };
}

function makeTexture(draw) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  draw(ctx, canvas.width);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
