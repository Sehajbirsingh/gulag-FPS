import test from "node:test";
import assert from "node:assert/strict";
import { MatchManager } from "../server/matchManager.js";

function makeIo() {
  const events = [];
  return {
    events,
    to(target) {
      return {
        emit(event, payload) {
          events.push({ target, event, payload });
        }
      };
    }
  };
}

function makeSocket(id) {
  return { id, join() {} };
}

function setupMatch(options = {}) {
  const io = makeIo();
  const manager = new MatchManager(io, options);
  const first = makeSocket("first");
  const second = makeSocket("second");
  const created = manager.createRoom(first);
  manager.joinRoom(second, created.code);
  manager.setReady(first, true);
  manager.setReady(second, true);
  return { io, manager, first, second, room: manager.rooms.get(created.code) };
}

function arrangeClearDuel(room) {
  const shooter = room.players.get("first");
  const target = room.players.get("second");
  shooter.position = { x: -5, y: 0, z: 2.8 };
  shooter.crouch = false;
  shooter.lastShotAt = 0;
  target.position = { x: 5, y: 0, z: 2.8 };
  target.yaw = Math.PI / 2;
  target.crouch = false;
  aimAt(shooter, { x: 5, y: 1.63, z: 2.8 });
  return { shooter, target };
}

function aimAt(shooter, point) {
  const eyeY = shooter.position.y + (shooter.crouch ? 1.05 : 1.62);
  const delta = {
    x: point.x - shooter.position.x,
    y: point.y - eyeY,
    z: point.z - shooter.position.z
  };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  const direction = { x: delta.x / length, y: delta.y / length, z: delta.z / length };
  shooter.yaw = Math.atan2(-direction.x, -direction.z);
  shooter.pitch = Math.asin(direction.y);
}

test("a validated client room code is preserved by the server", () => {
  const manager = new MatchManager(makeIo());
  const room = manager.createRoom(makeSocket("creator"), "AB2CD");

  assert.equal(room.code, "AB2CD");
  assert.throws(() => manager.createRoom(makeSocket("duplicate"), "AB2CD"), /already exists/);
  assert.throws(() => manager.createRoom(makeSocket("invalid"), "OOOOO"), /Invalid room code/);
});

test("timer expiry restarts the same round without awarding a win", async () => {
  const io = makeIo();
  const manager = new MatchManager(io, { roundTransitionMs: 5 });
  const first = makeSocket("first");
  const second = makeSocket("second");
  const created = manager.createRoom(first);
  manager.joinRoom(second, created.code);
  manager.setReady(first, true);
  manager.setReady(second, true);

  const room = manager.rooms.get(created.code);
  room.players.get("first").hp = 25;
  room.players.get("second").hp = 100;
  room.roundEndsAt = Date.now() - 1;
  manager.tick();

  assert.equal(room.status, "roundEnd");
  assert.deepEqual(room.wins, [0, 0]);
  assert.equal(room.round, 1);
  assert.match(room.lastRoundResult.reason, /restarting/);

  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(room.status, "playing");
  assert.equal(room.round, 1);
  assert.deepEqual(room.wins, [0, 0]);
  assert.equal(room.players.get("first").hp, 100);
  assert.equal(room.players.get("second").hp, 100);
});

test("server rejects cover movement, echoes its sequence, and accepts recovery", () => {
  const io = makeIo();
  const manager = new MatchManager(io);
  const first = makeSocket("first");
  const second = makeSocket("second");
  const created = manager.createRoom(first);
  manager.joinRoom(second, created.code);
  manager.setReady(first, true);
  manager.setReady(second, true);

  const room = manager.rooms.get(created.code);
  const player = room.players.get("first");
  const before = { ...player.position };
  const rejected = manager.updatePlayer(first, {
    position: { x: -12.75, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    seq: 1
  });

  assert.equal(rejected.accepted, false);
  assert.equal(rejected.state.seq, 1);
  assert.deepEqual(rejected.state.position, before);
  assert.deepEqual(player.position, before);
  player.lastPositionAt = Date.now() - 100;
  const recovered = manager.updatePlayer(first, {
    position: { x: before.x, y: 0, z: before.z + 0.25 },
    yaw: player.yaw,
    pitch: 0,
    seq: 2
  });

  assert.equal(recovered.accepted, true);
  assert.equal(player.position.z, before.z + 0.25);
  assert.equal(manager.publicRoom(room, second.id).players.find((item) => item.id === first.id).seq, 2);
});

test("ready messages cannot restart an active round", () => {
  const { manager, first, room } = setupMatch();
  assert.equal(room.round, 1);

  manager.setReady(first, true);

  assert.equal(room.round, 1);
  assert.equal(room.status, "playing");
});

test("spawn cabin blocks a shot and returns the wall impact point", () => {
  const { manager, first, room } = setupMatch();
  const target = room.players.get("second");

  const shot = manager.fire(first, { shotId: "blocked-shot" });

  assert.equal(shot.hit, null);
  assert.ok(shot.coverHit);
  assert.ok(Math.abs(shot.coverHit.point.x - (-13.125)) < 0.001);
  assert.equal(target.hp, 100);
  assert.equal(room.status, "playing");
});

test("a headshot is an instant kill and awards the round", () => {
  const { manager, first, room } = setupMatch({ roundTransitionMs: 5 });
  const { target } = arrangeClearDuel(room);

  const shot = manager.fire(first, { shotId: "headshot" });

  assert.equal(shot.hit?.part, "head");
  assert.equal(target.hp, 0);
  assert.equal(target.dead, true);
  assert.deepEqual(room.wins, [1, 0]);
  assert.equal(room.status, "roundEnd");
});

test("torso damage kills in exactly two hits", () => {
  const { manager, first, room } = setupMatch({ roundTransitionMs: 5 });
  const { shooter, target } = arrangeClearDuel(room);
  aimAt(shooter, { x: 5, y: 1.05, z: 2.8 });

  const firstShot = manager.fire(first, { shotId: "body-1" });
  assert.equal(firstShot.hit?.part, "torso");
  assert.equal(target.hp, 50);
  assert.equal(room.status, "playing");

  shooter.lastShotAt = 0;
  const secondShot = manager.fire(first, { shotId: "body-2" });
  assert.equal(secondShot.hit?.part, "torso");
  assert.equal(target.hp, 0);
  assert.equal(room.status, "roundEnd");
});

test("limb damage kills in exactly four hits", () => {
  const { manager, first, room } = setupMatch({ roundTransitionMs: 5 });
  const { shooter, target } = arrangeClearDuel(room);
  aimAt(shooter, { x: 5, y: 1.08, z: 2.33 });

  for (const expectedHp of [75, 50, 25, 0]) {
    shooter.lastShotAt = 0;
    const shot = manager.fire(first, { shotId: `limb-${expectedHp}` });
    assert.equal(shot.hit?.part, "limb");
    assert.equal(target.hp, expectedHp);
  }
  assert.equal(room.status, "roundEnd");
});

test("fire rate and magazine limits are enforced by the server", () => {
  const { manager, first, room } = setupMatch();
  const { shooter } = arrangeClearDuel(room);
  aimAt(shooter, { x: 5, y: 3, z: 2.8 });

  const accepted = manager.fire(first, { shotId: "first" });
  const rateLimited = manager.fire(first, { shotId: "too-fast" });
  assert.equal(accepted.ammo, 7);
  assert.equal(rateLimited, null);
  assert.equal(shooter.ammo, 7);

  shooter.ammo = 0;
  shooter.lastShotAt = 0;
  assert.equal(manager.fire(first, { shotId: "empty" }), null);
  assert.equal(shooter.ammo, 0);
});

test("reload is single-flight and refills the magazine after its timer", async () => {
  const { io, manager, first, room } = setupMatch({ reloadMs: 5 });
  const player = room.players.get("first");
  player.ammo = 2;

  manager.reload(first);
  const firstReloadUntil = player.reloadUntil;
  manager.reload(first);

  const reloadEvents = io.events.filter((event) => event.event === "weapon:reload-start");
  assert.equal(reloadEvents.length, 1);
  assert.equal(reloadEvents[0].payload.reloadMs, 5);
  assert.equal(player.reloadUntil, firstReloadUntil);

  await new Promise((resolve) => setTimeout(resolve, 12));
  assert.equal(player.ammo, 8);
  assert.equal(player.reloadUntil, 0);
});

test("three round wins end a best-of-five match with clean resets between rounds", async () => {
  const { manager, first, room } = setupMatch({ roundTransitionMs: 5 });

  for (let win = 1; win <= 3; win += 1) {
    const { shooter, target } = arrangeClearDuel(room);
    shooter.ammo = win === 1 ? 3 : 8;
    target.hp = win === 1 ? 25 : 100;
    const shot = manager.fire(first, { shotId: `round-win-${win}` });

    assert.equal(shot.hit?.part, "head");
    assert.equal(room.wins[0], win);
    if (win < 3) {
      assert.equal(room.status, "roundEnd");
      await new Promise((resolve) => setTimeout(resolve, 12));
      assert.equal(room.status, "playing");
      assert.equal(room.round, win + 1);
      assert.equal(room.players.get("first").ammo, 8);
      assert.equal(room.players.get("second").hp, 100);
      assert.equal(room.players.get("second").dead, false);
    }
  }

  assert.equal(room.status, "matchEnd");
  assert.equal(room.matchWinner, 0);
  assert.deepEqual(room.wins, [3, 0]);
});

test("disconnecting during combat awards the match to the remaining player", () => {
  const { manager, second, room } = setupMatch();

  manager.disconnect(second);

  assert.equal(room.status, "matchEnd");
  assert.equal(room.matchWinner, 0);
  assert.equal(room.players.size, 1);
});
