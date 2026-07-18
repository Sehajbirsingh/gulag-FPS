import { GAME_CONFIG } from "./config.js";

const BASE_HITBOXES = [
  { part: "head", center: { x: 0, y: 1.63, z: 0 }, half: { x: 0.23, y: 0.23, z: 0.23 } },
  { part: "torso", center: { x: 0, y: 1.05, z: 0 }, half: { x: 0.34, y: 0.48, z: 0.2 } },
  { part: "limb", name: "left-arm", center: { x: -0.47, y: 1.08, z: 0 }, half: { x: 0.11, y: 0.43, z: 0.11 } },
  { part: "limb", name: "right-arm", center: { x: 0.47, y: 1.08, z: 0 }, half: { x: 0.11, y: 0.43, z: 0.11 } },
  { part: "limb", name: "left-leg", center: { x: -0.17, y: 0.42, z: 0 }, half: { x: 0.13, y: 0.42, z: 0.13 } },
  { part: "limb", name: "right-leg", center: { x: 0.17, y: 0.42, z: 0 }, half: { x: 0.13, y: 0.42, z: 0.13 } }
];

export function getPlayerHitboxes(player) {
  const crouchDrop = player.crouch ? 0.42 : 0;
  return BASE_HITBOXES.map((box) => ({
    ...box,
    center: { ...box.center, y: Math.max(0.25, box.center.y - crouchDrop) }
  }));
}

export function intersectPlayerHitboxes(rayOrigin, rayDirection, player) {
  const maxRange = GAME_CONFIG.pistol.range;
  const dir = normalize(rayDirection);
  let closest = null;

  for (const box of getPlayerHitboxes(player)) {
    const localOrigin = worldToPlayerLocal(rayOrigin, player);
    const localDirection = rotateY(dir, -(player.yaw ?? 0));
    const hit = rayAabb(localOrigin, localDirection, box.center, box.half, maxRange);
    if (!hit) continue;

    if (!closest || hit.distance < closest.distance) {
      closest = {
        part: box.part,
        name: box.name ?? box.part,
        distance: hit.distance,
        point: playerLocalToWorld(hit.point, player)
      };
    }
  }

  return closest;
}

function worldToPlayerLocal(point, player) {
  const translated = {
    x: point.x - player.position.x,
    y: point.y - player.position.y,
    z: point.z - player.position.z
  };
  return rotateY(translated, -(player.yaw ?? 0));
}

function playerLocalToWorld(point, player) {
  const rotated = rotateY(point, player.yaw ?? 0);
  return {
    x: rotated.x + player.position.x,
    y: rotated.y + player.position.y,
    z: rotated.z + player.position.z
  };
}

function rayAabb(origin, direction, center, half, maxDistance) {
  const min = { x: center.x - half.x, y: center.y - half.y, z: center.z - half.z };
  const max = { x: center.x + half.x, y: center.y + half.y, z: center.z + half.z };
  let tMin = 0;
  let tMax = maxDistance;

  for (const axis of ["x", "y", "z"]) {
    if (Math.abs(direction[axis]) < 0.000001) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null;
      continue;
    }

    const inv = 1 / direction[axis];
    let t1 = (min[axis] - origin[axis]) * inv;
    let t2 = (max[axis] - origin[axis]) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  const distance = tMin >= 0 ? tMin : tMax;
  if (distance < 0 || distance > maxDistance) return null;
  return {
    distance,
    point: {
      x: origin.x + direction.x * distance,
      y: origin.y + direction.y * distance,
      z: origin.z + direction.z * distance
    }
  };
}

function rotateY(point, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: point.x * c - point.z * s,
    y: point.y,
    z: point.x * s + point.z * c
  };
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}
