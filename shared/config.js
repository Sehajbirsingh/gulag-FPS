export const GAME_CONFIG = {
  bestOfRounds: 5,
  winsToMatch: 3,
  roundSeconds: 60,
  roundTransitionMs: 2200,
  tickRateMs: 100,
  player: {
    maxHealth: 100,
    radius: 0.36,
    height: 1.8,
    crouchHeight: 1.2,
    eyeHeight: 1.62,
    crouchEyeHeight: 1.05,
    walkSpeed: 5.2,
    silentWalkSpeed: 2.35,
    crouchSpeed: 2.7,
    jumpVelocity: 5.6,
    gravity: 16
  },
  pistol: {
    magazineSize: 8,
    fireCooldownMs: 420,
    reloadMs: 1600,
    range: 42,
    spreadRadians: 0.004
  },
  damage: {
    head: 100,
    torso: 50,
    limb: 25
  },
  arena: {
    width: 36,
    depth: 27,
    wallHeight: 3.2,
    floorY: 0
  },
  spawns: [
    { x: -15.2, y: 0, z: 0, yaw: -Math.PI / 2 },
    { x: 15.2, y: 0, z: 0, yaw: Math.PI / 2 }
  ],
  cover: [
    { id: "spawn-cabin-a-screen", type: "cabin", x: -12.75, z: 0, w: 0.75, d: 6.2, h: 2.35 },
    { id: "spawn-cabin-a-back", type: "concrete", x: -17.15, z: 0, w: 0.5, d: 6.6, h: 2.15 },
    { id: "spawn-cabin-a-post-n", type: "pillar", x: -12.75, z: -3.45, w: 0.8, d: 0.8, h: 2.45 },
    { id: "spawn-cabin-a-post-s", type: "pillar", x: -12.75, z: 3.45, w: 0.8, d: 0.8, h: 2.45 },
    { id: "spawn-cabin-b-screen", type: "cabin", x: 12.75, z: 0, w: 0.75, d: 6.2, h: 2.35 },
    { id: "spawn-cabin-b-back", type: "concrete", x: 17.15, z: 0, w: 0.5, d: 6.6, h: 2.15 },
    { id: "spawn-cabin-b-post-n", type: "pillar", x: 12.75, z: -3.45, w: 0.8, d: 0.8, h: 2.45 },
    { id: "spawn-cabin-b-post-s", type: "pillar", x: 12.75, z: 3.45, w: 0.8, d: 0.8, h: 2.45 },
    { id: "mid-low-wall-a", type: "low-wall", x: 0, z: -4.35, w: 7.5, d: 0.65, h: 1.05 },
    { id: "mid-low-wall-b", type: "low-wall", x: 0, z: 4.35, w: 7.5, d: 0.65, h: 1.05 },
    { id: "center-broken-booth", type: "concrete", x: 0, z: 0, w: 1.8, d: 1.8, h: 1.45 },
    { id: "left-crate-stack", type: "crate", x: -6.75, z: -7.8, w: 3.0, d: 2.6, h: 1.5 },
    { id: "right-crate-stack", type: "crate", x: 6.75, z: 7.8, w: 3.0, d: 2.6, h: 1.5 },
    { id: "left-barrier", type: "barrier", x: -8.1, z: 5.55, w: 4.2, d: 0.65, h: 1.15 },
    { id: "right-barrier", type: "barrier", x: 8.1, z: -5.55, w: 4.2, d: 0.65, h: 1.15 },
    { id: "pillar-nw", type: "pillar", x: -2.7, z: -9.0, w: 1.1, d: 1.1, h: 2.35 },
    { id: "pillar-se", type: "pillar", x: 2.7, z: 9.0, w: 1.1, d: 1.1, h: 2.35 },
    { id: "flank-low-wall-a", type: "low-wall", x: -10.7, z: 0, w: 0.65, d: 4.8, h: 1.05 },
    { id: "flank-low-wall-b", type: "low-wall", x: 10.7, z: 0, w: 0.65, d: 4.8, h: 1.05 },
    { id: "north-crate", type: "crate", x: 5.2, z: -10.2, w: 2.4, d: 1.6, h: 1.25 },
    { id: "south-crate", type: "crate", x: -5.2, z: 10.2, w: 2.4, d: 1.6, h: 1.25 }
  ]
};

export function clampToArena(position, radius = GAME_CONFIG.player.radius) {
  const halfW = GAME_CONFIG.arena.width / 2 - radius;
  const halfD = GAME_CONFIG.arena.depth / 2 - radius;
  return {
    x: Math.max(-halfW, Math.min(halfW, position.x)),
    y: Math.max(0, position.y ?? 0),
    z: Math.max(-halfD, Math.min(halfD, position.z))
  };
}

export function obstacleBounds(item) {
  return {
    minX: item.x - item.w / 2,
    maxX: item.x + item.w / 2,
    minZ: item.z - item.d / 2,
    maxZ: item.z + item.d / 2,
    minY: 0,
    maxY: item.h
  };
}

export function isPositionBlocked(position, radius = GAME_CONFIG.player.radius) {
  return GAME_CONFIG.cover.some((item) => {
    if ((position.y ?? 0) >= item.h - 0.02) return false;
    const bounds = expandedObstacleBounds(item, radius);
    return position.x > bounds.minX && position.x < bounds.maxX
      && position.z > bounds.minZ && position.z < bounds.maxZ;
  });
}

export function isMovementBlocked(start, end, radius = GAME_CONFIG.player.radius) {
  return GAME_CONFIG.cover.some((item) => {
    if (Math.min(start.y ?? 0, end.y ?? 0) >= item.h - 0.02) return false;
    return segmentIntersectsAabb2d(start, end, expandedObstacleBounds(item, radius));
  });
}

export function expandedObstacleBounds(item, radius = GAME_CONFIG.player.radius) {
  const bounds = obstacleBounds(item);
  return {
    ...bounds,
    minX: bounds.minX - radius,
    maxX: bounds.maxX + radius,
    minZ: bounds.minZ - radius,
    maxZ: bounds.maxZ + radius
  };
}

function segmentIntersectsAabb2d(start, end, bounds) {
  let tMin = 0;
  let tMax = 1;
  const delta = { x: end.x - start.x, z: end.z - start.z };

  for (const [axis, minKey, maxKey] of [["x", "minX", "maxX"], ["z", "minZ", "maxZ"]]) {
    if (Math.abs(delta[axis]) < 0.000001) {
      if (start[axis] <= bounds[minKey] || start[axis] >= bounds[maxKey]) return false;
      continue;
    }

    let near = (bounds[minKey] - start[axis]) / delta[axis];
    let far = (bounds[maxKey] - start[axis]) / delta[axis];
    if (near > far) [near, far] = [far, near];
    tMin = Math.max(tMin, near);
    tMax = Math.min(tMax, far);
    if (tMin > tMax) return false;
  }

  return tMax > 0 && tMin < 1;
}
