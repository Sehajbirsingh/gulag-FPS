import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { io as createClient } from "socket.io-client";
import { attachGameServer } from "../server/gameServer.js";

test("two WebSocket clients receive the same authoritative headshot", { timeout: 5000 }, async () => {
  const httpServer = createServer();
  const gameServer = attachGameServer(httpServer, {
    tickRateMs: 20,
    matchOptions: { roundTransitionMs: 5 }
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const url = `http://127.0.0.1:${port}`;
  const first = createClient(url, { transports: ["websocket"], forceNew: true, reconnection: false });
  const second = createClient(url, { transports: ["websocket"], forceNew: true, reconnection: false });

  try {
    await Promise.all([once(first, "connect"), once(second, "connect")]);
    const created = await request(first, "room:create");
    await request(second, "room:join", { code: created.code });

    const roundStarts = [once(first, "round:start"), once(second, "round:start")];
    first.emit("player:ready", { ready: true });
    second.emit("player:ready", { ready: true });
    await Promise.all(roundStarts);

    const room = gameServer.manager.rooms.get(created.code);
    const shooter = room.players.get(first.id);
    const target = room.players.get(second.id);
    shooter.position = { x: -5, y: 0, z: 2.8 };
    shooter.yaw = 0;
    shooter.pitch = 0.001;
    shooter.lastShotAt = 0;
    target.position = { x: 5, y: 0, z: 2.8 };
    target.yaw = Math.PI / 2;

    const shotEvents = [once(first, "weapon:shot"), once(second, "weapon:shot")];
    const roundEnds = [once(first, "round:end"), once(second, "round:end")];
    first.emit("player:update", {
      position: shooter.position,
      yaw: -Math.PI / 2,
      pitch: 0.001,
      crouch: false,
      slowWalk: false,
      seq: 1
    });
    first.emit("weapon:fire", {
      shotId: "network-headshot",
      direction: { x: -1, y: 0, z: 0 }
    });

    const [firstShot, secondShot] = await Promise.all(shotEvents);
    const [firstEnd, secondEnd] = await Promise.all(roundEnds);
    assert.deepEqual(firstShot, secondShot);
    assert.equal(firstShot.shotId, "network-headshot");
    assert.equal(firstShot.hit?.part, "head");
    assert.equal(firstShot.hit?.targetId, second.id);
    assert.equal(firstShot.hit?.hp, 0);
    assert.equal(firstEnd.winnerSlot, 0);
    assert.deepEqual(firstEnd, secondEnd);
    assert.equal(room.status, "roundEnd");
  } finally {
    first.disconnect();
    second.disconnect();
    await gameServer.close();
  }
});

test("movement rejection and recovery converge on both WebSocket clients", { timeout: 7000 }, async () => {
  const httpServer = createServer();
  const gameServer = attachGameServer(httpServer, { tickRateMs: 25 });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const url = `http://127.0.0.1:${port}`;
  const first = createClient(url, { transports: ["websocket"], forceNew: true, reconnection: false });
  const second = createClient(url, { transports: ["websocket"], forceNew: true, reconnection: false });

  try {
    await Promise.all([once(first, "connect"), once(second, "connect")]);
    const created = await request(first, "room:create");
    await request(second, "room:join", { code: created.code });
    const roundStarts = [once(first, "round:start"), once(second, "round:start")];
    first.emit("player:ready", { ready: true });
    second.emit("player:ready", { ready: true });
    await Promise.all(roundStarts);

    const spawn = gameServer.manager.rooms.get(created.code).players.get(first.id).position;
    const legalPosition = { x: spawn.x, y: 0, z: spawn.z + 0.25 };
    first.emit("player:update", {
      position: legalPosition,
      yaw: -1.2,
      pitch: 0.1,
      crouch: false,
      slowWalk: false,
      seq: 1
    });

    const [legalA, legalB] = await Promise.all([
      waitForPlayerState(first, first.id, (player) => player.seq === 1),
      waitForPlayerState(second, first.id, (player) => player.seq === 1)
    ]);
    assert.deepEqual(legalA.position, legalPosition);
    assert.deepEqual(legalA, legalB);

    const correctionPromise = once(first, "player:correction");
    first.emit("player:update", {
      position: { x: -12.75, y: 0, z: 0 },
      yaw: -1.2,
      pitch: 0.1,
      crouch: false,
      slowWalk: false,
      seq: 2
    });
    const correction = await correctionPromise;
    assert.equal(correction.seq, 2);
    assert.deepEqual(correction.position, legalPosition);

    const [rejectedA, rejectedB] = await Promise.all([
      waitForPlayerState(first, first.id, (player) => player.seq === 2),
      waitForPlayerState(second, first.id, (player) => player.seq === 2)
    ]);
    assert.deepEqual(rejectedA.position, legalPosition);
    assert.deepEqual(rejectedA, rejectedB);

    await delay(40);
    const recoveredPosition = { ...legalPosition, z: legalPosition.z + 0.2 };
    first.emit("player:update", {
      position: recoveredPosition,
      yaw: -1.2,
      pitch: 0.1,
      crouch: true,
      slowWalk: false,
      seq: 3
    });
    const [recoveredA, recoveredB] = await Promise.all([
      waitForPlayerState(first, first.id, (player) => player.seq === 3),
      waitForPlayerState(second, first.id, (player) => player.seq === 3)
    ]);
    assert.deepEqual(recoveredA.position, recoveredPosition);
    assert.deepEqual(recoveredA, recoveredB);
    assert.equal(recoveredB.crouch, true);
  } finally {
    first.disconnect();
    second.disconnect();
    await gameServer.close();
  }
});

test("simultaneous movement streams converge for both players", { timeout: 7000 }, async () => {
  const httpServer = createServer();
  const gameServer = attachGameServer(httpServer, { tickRateMs: 25 });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const url = `http://127.0.0.1:${port}`;
  const first = createClient(url, { transports: ["websocket"], forceNew: true, reconnection: false });
  const second = createClient(url, { transports: ["websocket"], forceNew: true, reconnection: false });

  try {
    await Promise.all([once(first, "connect"), once(second, "connect")]);
    const created = await request(first, "room:create");
    await request(second, "room:join", { code: created.code });
    const roundStarts = [once(first, "round:start"), once(second, "round:start")];
    first.emit("player:ready", { ready: true });
    second.emit("player:ready", { ready: true });
    await Promise.all(roundStarts);

    const room = gameServer.manager.rooms.get(created.code);
    const firstSpawn = { ...room.players.get(first.id).position };
    const secondSpawn = { ...room.players.get(second.id).position };
    for (let seq = 1; seq <= 12; seq += 1) {
      first.emit("player:update", {
        position: { ...firstSpawn, z: firstSpawn.z + seq * 0.08 },
        yaw: -Math.PI / 2 + seq * 0.01,
        pitch: 0,
        crouch: false,
        slowWalk: false,
        seq
      });
      second.emit("player:update", {
        position: { ...secondSpawn, z: secondSpawn.z - seq * 0.08 },
        yaw: Math.PI / 2 - seq * 0.01,
        pitch: 0,
        crouch: false,
        slowWalk: false,
        seq
      });
      await delay(35);
    }

    const [viewA, viewB] = await Promise.all([
      waitForRoomState(first, (state) => state.players.every((player) => player.seq === 12)),
      waitForRoomState(second, (state) => state.players.every((player) => player.seq === 12))
    ]);
    assert.deepEqual(viewA.players, viewB.players);
    assert.equal(viewA.players.find((player) => player.id === first.id).position.z, 0.96);
    assert.equal(viewA.players.find((player) => player.id === second.id).position.z, -0.96);
  } finally {
    first.disconnect();
    second.disconnect();
    await gameServer.close();
  }
});

test("networked cover impact and two-hit torso kill stay synchronized", { timeout: 5000 }, async () => {
  const httpServer = createServer();
  const gameServer = attachGameServer(httpServer, {
    tickRateMs: 20,
    matchOptions: { roundTransitionMs: 5 }
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const url = `http://127.0.0.1:${port}`;
  const first = createClient(url, { transports: ["websocket"], forceNew: true, reconnection: false });
  const second = createClient(url, { transports: ["websocket"], forceNew: true, reconnection: false });

  try {
    await Promise.all([once(first, "connect"), once(second, "connect")]);
    const created = await request(first, "room:create");
    await request(second, "room:join", { code: created.code });
    const roundStarts = [once(first, "round:start"), once(second, "round:start")];
    first.emit("player:ready", { ready: true });
    second.emit("player:ready", { ready: true });
    await Promise.all(roundStarts);

    const blockedEvents = [once(first, "weapon:shot"), once(second, "weapon:shot")];
    first.emit("weapon:fire", { shotId: "network-cover" });
    const [blockedA, blockedB] = await Promise.all(blockedEvents);
    assert.deepEqual(blockedA, blockedB);
    assert.equal(blockedA.hit, null);
    assert.ok(blockedA.coverHit);

    const room = gameServer.manager.rooms.get(created.code);
    const shooter = room.players.get(first.id);
    const target = room.players.get(second.id);
    shooter.position = { x: -5, y: 0, z: 2.8 };
    shooter.yaw = -Math.PI / 2;
    shooter.pitch = -0.0569;
    shooter.lastShotAt = 0;
    target.position = { x: 5, y: 0, z: 2.8 };
    target.yaw = Math.PI / 2;

    const firstBodyEvents = [once(first, "weapon:shot"), once(second, "weapon:shot")];
    first.emit("weapon:fire", { shotId: "network-body-1" });
    const [bodyOneA, bodyOneB] = await Promise.all(firstBodyEvents);
    assert.deepEqual(bodyOneA, bodyOneB);
    assert.equal(bodyOneA.hit?.part, "torso");
    assert.equal(bodyOneA.hit?.hp, 50);
    assert.equal(room.status, "playing");

    shooter.lastShotAt = 0;
    const secondBodyEvents = [once(first, "weapon:shot"), once(second, "weapon:shot")];
    const roundEnds = [once(first, "round:end"), once(second, "round:end")];
    first.emit("weapon:fire", { shotId: "network-body-2" });
    const [bodyTwoA, bodyTwoB] = await Promise.all(secondBodyEvents);
    const [endA, endB] = await Promise.all(roundEnds);
    assert.deepEqual(bodyTwoA, bodyTwoB);
    assert.equal(bodyTwoA.hit?.part, "torso");
    assert.equal(bodyTwoA.hit?.hp, 0);
    assert.deepEqual(endA, endB);
    assert.equal(endA.winnerSlot, 0);
    assert.equal(shooter.ammo, 5);
  } finally {
    first.disconnect();
    second.disconnect();
    await gameServer.close();
  }
});

function request(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) => {
      if (response?.ok) resolve(response.data);
      else reject(new Error(response?.error || `${event} failed`));
    });
  });
}

function once(socket, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 1500);
    socket.once(event, (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

function waitForPlayerState(socket, playerId, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("room:state", handleRoom);
      reject(new Error("Timed out waiting for synchronized player state"));
    }, 2000);
    function handleRoom(room) {
      const player = room.players.find((item) => item.id === playerId);
      if (!player || !predicate(player)) return;
      clearTimeout(timeout);
      socket.off("room:state", handleRoom);
      resolve(player);
    }
    socket.on("room:state", handleRoom);
  });
}

function waitForRoomState(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("room:state", handleRoom);
      reject(new Error("Timed out waiting for synchronized room state"));
    }, 2000);
    function handleRoom(room) {
      if (!predicate(room)) return;
      clearTimeout(timeout);
      socket.off("room:state", handleRoom);
      resolve(room);
    }
    socket.on("room:state", handleRoom);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
