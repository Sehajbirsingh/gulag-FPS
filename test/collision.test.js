import test from "node:test";
import assert from "node:assert/strict";
import {
  GAME_CONFIG,
  clampToArena,
  isMovementBlocked,
  isPositionBlocked
} from "../shared/config.js";

test("spawn cabins contain both players without trapping their spawn point", () => {
  for (const spawn of GAME_CONFIG.spawns) {
    assert.equal(isPositionBlocked(spawn), false);
  }
});

test("cover positions and attempts to tunnel through cover are rejected", () => {
  assert.equal(isPositionBlocked({ x: -12.75, y: 0, z: 0 }), true);
  assert.equal(
    isMovementBlocked({ x: -14, y: 0, z: 0 }, { x: -11.5, y: 0, z: 0 }),
    true
  );
});

test("movement above a low wall is allowed", () => {
  assert.equal(
    isMovementBlocked({ x: 0, y: 1.2, z: -5 }, { x: 0, y: 1.2, z: -3.8 }),
    false
  );
});

test("arena clamp always keeps the player capsule inside the boundary", () => {
  const result = clampToArena({ x: 999, y: -4, z: -999 });
  assert.equal(result.x, GAME_CONFIG.arena.width / 2 - GAME_CONFIG.player.radius);
  assert.equal(result.y, 0);
  assert.equal(result.z, -GAME_CONFIG.arena.depth / 2 + GAME_CONFIG.player.radius);
});
