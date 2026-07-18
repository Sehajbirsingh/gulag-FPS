export const GAME_CONFIG = {
  bestOfRounds: 5,
  winsToMatch: 3,
  roundSeconds: 120,
  equalHpSuddenDeath: true,
  suddenDeathNextHitWins: true,
  tickRateMs: 100,
  player: {
    maxHealth: 100,
    radius: 0.36,
    height: 1.8,
    crouchHeight: 1.2,
    eyeHeight: 1.62,
    crouchEyeHeight: 1.05,
    walkSpeed: 5.2,
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
    width: 24,
    depth: 18,
    wallHeight: 3,
    floorY: 0
  },
  spawns: [
    { x: -9.2, y: 0, z: 0, yaw: -Math.PI / 2 },
    { x: 9.2, y: 0, z: 0, yaw: Math.PI / 2 }
  ],
  cover: [
    { id: "mid-low-wall-a", type: "low-wall", x: 0, z: -2.9, w: 5.0, d: 0.5, h: 1.0 },
    { id: "mid-low-wall-b", type: "low-wall", x: 0, z: 2.9, w: 5.0, d: 0.5, h: 1.0 },
    { id: "left-crate-stack", type: "crate", x: -4.5, z: -5.2, w: 2.0, d: 1.8, h: 1.5 },
    { id: "right-crate-stack", type: "crate", x: 4.5, z: 5.2, w: 2.0, d: 1.8, h: 1.5 },
    { id: "left-barrier", type: "barrier", x: -5.4, z: 3.7, w: 2.8, d: 0.55, h: 1.15 },
    { id: "right-barrier", type: "barrier", x: 5.4, z: -3.7, w: 2.8, d: 0.55, h: 1.15 },
    { id: "pillar-nw", type: "pillar", x: -1.8, z: -6.0, w: 1.0, d: 1.0, h: 2.35 },
    { id: "pillar-se", type: "pillar", x: 1.8, z: 6.0, w: 1.0, d: 1.0, h: 2.35 },
    { id: "spawn-cover-a", type: "low-wall", x: -7.8, z: 0, w: 0.55, d: 4.0, h: 1.05 },
    { id: "spawn-cover-b", type: "low-wall", x: 7.8, z: 0, w: 0.55, d: 4.0, h: 1.05 }
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
