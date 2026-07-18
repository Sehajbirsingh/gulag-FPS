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
    shooter.yaw = -Math.PI / 2;
    shooter.pitch = 0.001;
    shooter.lastShotAt = 0;
    target.position = { x: 5, y: 0, z: 2.8 };
    target.yaw = Math.PI / 2;

    const shotEvents = [once(first, "weapon:shot"), once(second, "weapon:shot")];
    const roundEnds = [once(first, "round:end"), once(second, "round:end")];
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
