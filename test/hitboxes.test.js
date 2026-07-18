import test from "node:test";
import assert from "node:assert/strict";
import { intersectPlayerHitboxes } from "../shared/hitboxes.js";

const standingPlayer = {
  position: { x: 0, y: 0, z: 0 },
  yaw: 0,
  crouch: false
};

function castAt(x, y, player = standingPlayer) {
  return intersectPlayerHitboxes(
    { x, y, z: 5 },
    { x: 0, y: 0, z: -1 },
    player
  );
}

test("distinct player hitboxes classify head, torso, arms, and legs", () => {
  assert.equal(castAt(0, 1.63)?.part, "head");
  assert.equal(castAt(0, 1.05)?.part, "torso");
  assert.equal(castAt(-0.47, 1.08)?.name, "left-arm");
  assert.equal(castAt(0.47, 1.08)?.name, "right-arm");
  assert.equal(castAt(-0.17, 0.42)?.name, "left-leg");
  assert.equal(castAt(0.17, 0.42)?.name, "right-leg");
});

test("rays outside every body part miss", () => {
  assert.equal(castAt(1.2, 1.2), null);
});

test("crouching lowers all hitboxes", () => {
  const crouched = { ...standingPlayer, crouch: true };
  assert.equal(castAt(0, 1.63, crouched), null);
  assert.equal(castAt(0, 1.21, crouched)?.part, "head");
});
