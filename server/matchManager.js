import { GAME_CONFIG, clampToArena, isMovementBlocked, isPositionBlocked } from "../shared/config.js";
import { intersectPlayerHitboxes } from "../shared/hitboxes.js";

const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class MatchManager {
  constructor(io, {
    roundTransitionMs = GAME_CONFIG.roundTransitionMs,
    reloadMs = GAME_CONFIG.pistol.reloadMs
  } = {}) {
    this.io = io;
    this.roundTransitionMs = roundTransitionMs;
    this.reloadMs = reloadMs;
    this.rooms = new Map();
    this.socketToRoom = new Map();
    this.waitingRoomCode = null;
  }

  createRoom(socket, requestedCode = null) {
    const code = requestedCode ? normalizeRoomCode(requestedCode) : this.generateRoomCode();
    if (this.rooms.has(code)) throw new Error("Room code already exists. Try again.");
    const room = {
      code,
      status: "waiting",
      round: 0,
      wins: [0, 0],
      players: new Map(),
      roundStartedAt: 0,
      roundEndsAt: 0,
      suddenDeath: false,
      lastRoundResult: null,
      matchWinner: null
    };
    this.rooms.set(code, room);
    this.addPlayer(room, socket);
    this.waitingRoomCode = code;
    return this.publicRoom(room, socket.id);
  }

  quickMatch(socket) {
    const waiting = this.waitingRoomCode ? this.rooms.get(this.waitingRoomCode) : null;
    if (waiting && waiting.players.size === 1 && !waiting.players.has(socket.id)) {
      return this.joinRoom(socket, waiting.code);
    }
    return this.createRoom(socket);
  }

  joinRoom(socket, rawCode) {
    const code = String(rawCode ?? "").trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new Error("Room not found.");
    if (room.players.size >= 2 && !room.players.has(socket.id)) throw new Error("Room is full.");
    if (!room.players.has(socket.id)) this.addPlayer(room, socket);
    if (this.waitingRoomCode === code && room.players.size >= 2) this.waitingRoomCode = null;
    return this.publicRoom(room, socket.id);
  }

  setReady(socket, ready) {
    const room = this.getRoomForSocket(socket);
    if (!room || room.status !== "waiting") return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.ready = Boolean(ready);
    this.broadcastRoom(room);
    if (room.players.size === 2 && [...room.players.values()].every((item) => item.ready)) {
      this.startNextRound(room);
    }
  }

  updatePlayer(socket, payload) {
    const room = this.getRoomForSocket(socket);
    if (!room || room.status !== "playing") return;
    const player = room.players.get(socket.id);
    if (!player || player.dead) return;

    const seq = Number.isFinite(payload?.seq) ? Math.floor(payload.seq) : null;
    if (seq !== null && seq <= player.seq) {
      return { accepted: false, stale: true, state: movementState(player) };
    }

    const now = Date.now();
    const position = clampToArena(sanitizeVector(payload?.position, player.position));
    const last = player.lastPositionAt || now;
    const delta = Math.max(0.016, Math.min(0.25, (now - last) / 1000));
    const maxStep = GAME_CONFIG.player.walkSpeed * 1.65 * delta + 0.35;
    const attemptedStep = distance2d(player.position, position);

    const acceptedMove = attemptedStep <= maxStep
      && !isPositionBlocked(position)
      && !isMovementBlocked(player.position, position);
    if (acceptedMove) {
      player.position = position;
    }

    player.lastPositionAt = now;
    player.yaw = sanitizeNumber(payload?.yaw, player.yaw, -Math.PI * 2, Math.PI * 2);
    player.pitch = sanitizeNumber(payload?.pitch, player.pitch, -1.35, 1.35);
    player.crouch = Boolean(payload?.crouch);
    player.slowWalk = Boolean(payload?.slowWalk) && !player.crouch;
    player.seq = seq ?? player.seq;
    return { accepted: acceptedMove, stale: false, state: movementState(player) };
  }

  fire(socket, payload) {
    const room = this.getRoomForSocket(socket);
    if (!room || room.status !== "playing") return null;
    const shooter = room.players.get(socket.id);
    if (!shooter || shooter.dead) return null;

    const now = Date.now();
    if (shooter.reloadUntil && shooter.reloadUntil > now) return null;
    if (now - shooter.lastShotAt < GAME_CONFIG.pistol.fireCooldownMs) return null;
    if (shooter.ammo <= 0) return null;

    shooter.lastShotAt = now;
    shooter.ammo -= 1;

    const origin = {
      ...shooter.position,
      y: shooter.position.y + (shooter.crouch ? GAME_CONFIG.player.crouchEyeHeight : GAME_CONFIG.player.eyeHeight)
    };
    const direction = directionFromAngles(shooter.yaw, shooter.pitch);
    const target = [...room.players.values()].find((player) => player.id !== shooter.id && !player.dead);
    let hit = null;
    const coverDistance = nearestEnvironmentDistance(origin, direction);

    if (target) {
      hit = intersectPlayerHitboxes(origin, direction, target);
      if (hit && (coverDistance === null || coverDistance > hit.distance)) {
        const damage = room.suddenDeath ? target.hp : GAME_CONFIG.damage[hit.part];
        target.hp = Math.max(0, target.hp - damage);
        if (room.suddenDeath || target.hp <= 0) {
          target.hp = 0;
          target.dead = true;
          this.finishRound(room, shooter.slot, `${shooter.name} won by ${hit.part} shot`);
        }
      } else {
        hit = null;
      }
    }

    const coverHit = !hit && coverDistance !== null
      ? { point: pointAlongRay(origin, direction, coverDistance) }
      : null;

    const shot = {
      shooterId: shooter.id,
      origin,
      direction,
      ammo: shooter.ammo,
      hit: hit ? { targetId: target.id, part: hit.part, name: hit.name, point: hit.point, hp: target.hp } : null,
      coverHit,
      shotId: payload?.shotId ?? now
    };
    this.io.to(room.code).emit("weapon:shot", shot);
    this.broadcastRoom(room);
    return shot;
  }

  reload(socket) {
    const room = this.getRoomForSocket(socket);
    if (!room || room.status !== "playing") return;
    const player = room.players.get(socket.id);
    if (!player || player.dead || player.ammo === GAME_CONFIG.pistol.magazineSize) return;
    const now = Date.now();
    if (player.reloadUntil > now) return;
    player.reloadUntil = now + this.reloadMs;
    this.io.to(socket.id).emit("weapon:reload-start", { reloadMs: this.reloadMs });
    setTimeout(() => {
      const activeRoom = this.rooms.get(room.code);
      const activePlayer = activeRoom?.players.get(socket.id);
      if (!activePlayer || activeRoom.status !== "playing") return;
      activePlayer.ammo = GAME_CONFIG.pistol.magazineSize;
      activePlayer.reloadUntil = 0;
      this.broadcastRoom(activeRoom);
    }, this.reloadMs);
  }

  tick() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.status === "playing" && !room.suddenDeath && now >= room.roundEndsAt) {
        this.resolveTimer(room);
      }
      if (room.players.size === 0) {
        this.rooms.delete(room.code);
        if (this.waitingRoomCode === room.code) this.waitingRoomCode = null;
        continue;
      }
      this.broadcastRoom(room, { volatile: true });
    }
  }

  disconnect(socket) {
    const room = this.getRoomForSocket(socket);
    if (!room) return;
    const leaving = room.players.get(socket.id);
    room.players.delete(socket.id);
    this.socketToRoom.delete(socket.id);

    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      if (this.waitingRoomCode === room.code) this.waitingRoomCode = null;
      return;
    }

    if (room.status === "playing" && leaving) {
      const remaining = [...room.players.values()][0];
      this.finishMatch(room, remaining.slot, "Opponent disconnected");
    } else {
      room.status = "waiting";
      room.matchWinner = null;
      for (const player of room.players.values()) player.ready = false;
      this.waitingRoomCode = room.code;
      this.broadcastRoom(room);
    }
  }

  startNextRound(room) {
    this.startRound(room, true);
  }

  startRound(room, incrementRound) {
    if (incrementRound) room.round += 1;
    room.status = "playing";
    room.roundStartedAt = Date.now();
    room.roundEndsAt = room.roundStartedAt + GAME_CONFIG.roundSeconds * 1000;
    room.suddenDeath = false;
    room.lastRoundResult = null;

    for (const player of room.players.values()) {
      this.resetPlayerForRound(player);
    }

    this.io.to(room.code).emit("round:start", this.publicRoom(room));
    this.broadcastRoom(room);
  }

  finishRound(room, winnerSlot, reason) {
    if (room.status !== "playing") return;
    room.status = "roundEnd";
    room.wins[winnerSlot] += 1;
    room.lastRoundResult = { winnerSlot, reason, wins: room.wins };
    this.io.to(room.code).emit("round:end", room.lastRoundResult);

    if (room.wins[winnerSlot] >= GAME_CONFIG.winsToMatch) {
      this.finishMatch(room, winnerSlot, reason);
      return;
    }

    setTimeout(() => {
      const activeRoom = this.rooms.get(room.code);
      if (!activeRoom || activeRoom.status !== "roundEnd") return;
      this.startNextRound(activeRoom);
    }, this.roundTransitionMs);
  }

  finishMatch(room, winnerSlot, reason) {
    room.status = "matchEnd";
    room.matchWinner = winnerSlot;
    room.lastRoundResult = { winnerSlot, reason, wins: room.wins };
    this.io.to(room.code).emit("match:end", { winnerSlot, reason, wins: room.wins });
    this.broadcastRoom(room);
  }

  resolveTimer(room) {
    if (room.status !== "playing" || room.players.size < 2) return;
    room.status = "roundEnd";
    room.lastRoundResult = {
      winnerSlot: null,
      reason: "Time expired - round restarting",
      wins: [...room.wins]
    };
    this.io.to(room.code).emit("round:end", room.lastRoundResult);
    this.broadcastRoom(room);

    setTimeout(() => {
      const activeRoom = this.rooms.get(room.code);
      if (!activeRoom || activeRoom.status !== "roundEnd") return;
      this.startRound(activeRoom, false);
    }, this.roundTransitionMs);
  }

  addPlayer(room, socket) {
    const slot = room.players.size === 0 ? 0 : 1;
    const player = {
      id: socket.id,
      slot,
      name: slot === 0 ? "Player 1" : "Player 2",
      ready: false,
      hp: GAME_CONFIG.player.maxHealth,
      ammo: GAME_CONFIG.pistol.magazineSize,
      reloadUntil: 0,
      lastShotAt: 0,
      position: { x: 0, y: 0, z: 0 },
      yaw: GAME_CONFIG.spawns[slot].yaw,
      pitch: 0,
      crouch: false,
      slowWalk: false,
      dead: false,
      seq: 0
    };
    this.resetPlayerForRound(player);
    room.players.set(socket.id, player);
    this.socketToRoom.set(socket.id, room.code);
    socket.join(room.code);
    this.broadcastRoom(room);
  }

  resetPlayerForRound(player) {
    const spawn = GAME_CONFIG.spawns[player.slot];
    player.hp = GAME_CONFIG.player.maxHealth;
    player.ammo = GAME_CONFIG.pistol.magazineSize;
    player.reloadUntil = 0;
    player.lastShotAt = 0;
    player.position = { x: spawn.x, y: spawn.y, z: spawn.z };
    player.yaw = spawn.yaw;
    player.pitch = 0;
    player.crouch = false;
    player.slowWalk = false;
    player.dead = false;
    player.lastPositionAt = Date.now();
  }

  publicRoom(room, viewerId = null) {
    return {
      code: room.code,
      status: room.status,
      round: room.round,
      wins: room.wins,
      roundEndsAt: room.roundEndsAt,
      suddenDeath: room.suddenDeath,
      lastRoundResult: room.lastRoundResult,
      matchWinner: room.matchWinner,
      viewerId,
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        slot: player.slot,
        name: player.name,
        ready: player.ready,
        hp: player.hp,
        ammo: player.ammo,
        position: player.position,
        yaw: player.yaw,
        pitch: player.pitch,
        crouch: player.crouch,
        slowWalk: player.slowWalk,
        dead: player.dead,
        seq: player.seq
      }))
    };
  }

  broadcastRoom(room, { volatile = false } = {}) {
    const roomChannel = this.io.to(room.code);
    const transport = volatile && roomChannel.volatile ? roomChannel.volatile : roomChannel;
    transport.emit("room:state", this.publicRoom(room));
  }

  getRoomForSocket(socket) {
    const code = this.socketToRoom.get(socket.id);
    return code ? this.rooms.get(code) : null;
  }

  generateRoomCode() {
    let code = "";
    do {
      code = Array.from({ length: 5 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join("");
    } while (this.rooms.has(code));
    return code;
  }
}

function movementState(player) {
  return {
    id: player.id,
    slot: player.slot,
    position: { ...player.position },
    yaw: player.yaw,
    pitch: player.pitch,
    crouch: player.crouch,
    slowWalk: player.slowWalk,
    dead: player.dead,
    seq: player.seq
  };
}

function normalizeRoomCode(value) {
  const code = String(value).trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) throw new Error("Invalid room code.");
  return code;
}

function sanitizeVector(value, fallback) {
  return {
    x: sanitizeNumber(value?.x, fallback.x, -100, 100),
    y: sanitizeNumber(value?.y, fallback.y ?? 0, -10, 10),
    z: sanitizeNumber(value?.z, fallback.z, -100, 100)
  };
}

function sanitizeNumber(value, fallback, min, max) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function directionFromAngles(yaw, pitch) {
  return normalize({
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch)
  });
}

function distance2d(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearestEnvironmentDistance(origin, direction) {
  let nearest = null;
  const bounds = GAME_CONFIG.cover.map((item) => ({
      minX: item.x - item.w / 2,
      maxX: item.x + item.w / 2,
      minY: 0,
      maxY: item.h,
      minZ: item.z - item.d / 2,
      maxZ: item.z + item.d / 2
  }));
  const halfW = GAME_CONFIG.arena.width / 2;
  const halfD = GAME_CONFIG.arena.depth / 2;
  const thickness = 0.35;
  bounds.push(
    { minX: -halfW - thickness / 2, maxX: -halfW + thickness / 2, minY: 0, maxY: GAME_CONFIG.arena.wallHeight, minZ: -halfD, maxZ: halfD },
    { minX: halfW - thickness / 2, maxX: halfW + thickness / 2, minY: 0, maxY: GAME_CONFIG.arena.wallHeight, minZ: -halfD, maxZ: halfD },
    { minX: -halfW, maxX: halfW, minY: 0, maxY: GAME_CONFIG.arena.wallHeight, minZ: -halfD - thickness / 2, maxZ: -halfD + thickness / 2 },
    { minX: -halfW, maxX: halfW, minY: 0, maxY: GAME_CONFIG.arena.wallHeight, minZ: halfD - thickness / 2, maxZ: halfD + thickness / 2 }
  );

  for (const itemBounds of bounds) {
    const hit = rayAabb(origin, direction, itemBounds);
    if (hit !== null && (nearest === null || hit < nearest)) nearest = hit;
  }
  return nearest;
}

function pointAlongRay(origin, direction, distance) {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance
  };
}

function rayAabb(origin, direction, bounds) {
  let tMin = 0;
  let tMax = GAME_CONFIG.pistol.range;
  const axes = [
    ["x", "minX", "maxX"],
    ["y", "minY", "maxY"],
    ["z", "minZ", "maxZ"]
  ];

  for (const [axis, minKey, maxKey] of axes) {
    if (Math.abs(direction[axis]) < 0.000001) {
      if (origin[axis] < bounds[minKey] || origin[axis] > bounds[maxKey]) return null;
      continue;
    }
    const inv = 1 / direction[axis];
    let t1 = (bounds[minKey] - origin[axis]) * inv;
    let t2 = (bounds[maxKey] - origin[axis]) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  const distance = tMin >= 0 ? tMin : tMax;
  return distance >= 0 && distance <= GAME_CONFIG.pistol.range ? distance : null;
}
