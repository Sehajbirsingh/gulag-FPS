import test from "node:test";
import assert from "node:assert/strict";
import {
  FOOTSTEP_HEARING_RADIUS,
  getOpponentFootstepVolume
} from "../src/audio/FootstepAudio.js";

test("opponent footsteps have a hard hearing cutoff", () => {
  assert.equal(getOpponentFootstepVolume(FOOTSTEP_HEARING_RADIUS), 0);
  assert.equal(getOpponentFootstepVolume(FOOTSTEP_HEARING_RADIUS + 20), 0);
});

test("opponent footsteps become smoothly louder with proximity", () => {
  const faint = getOpponentFootstepVolume(14);
  const medium = getOpponentFootstepVolume(9);
  const close = getOpponentFootstepVolume(3);

  assert.ok(faint > 0 && faint < 0.07);
  assert.ok(medium > faint);
  assert.ok(close > medium);
  assert.ok(close <= 0.255);
});
