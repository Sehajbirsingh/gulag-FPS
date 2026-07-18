import test from "node:test";
import assert from "node:assert/strict";
import { ClientPrediction } from "../src/net/ClientPrediction.js";

test("accepted updates preserve newer unacknowledged movement", () => {
  const prediction = new ClientPrediction();
  prediction.record(1, { x: 1, y: 0, z: 0 });
  prediction.record(2, { x: 2, y: 0, z: 0 });

  const result = prediction.reconcile(
    1,
    { x: 1, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 }
  );

  assert.deepEqual(result.position, { x: 2, y: 0, z: 0 });
  assert.equal(result.error, 0);
  assert.equal(prediction.history.has(1), false);
  assert.equal(prediction.history.has(2), true);
});

test("a rejected update corrects the current player and all later predictions", () => {
  const prediction = new ClientPrediction();
  prediction.record(1, { x: 1, y: 0, z: 0 });
  prediction.record(2, { x: 2, y: 0, z: 0 });

  const first = prediction.reconcile(
    1,
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 }
  );
  assert.deepEqual(first.position, { x: 1, y: 0, z: 0 });
  assert.deepEqual(prediction.history.get(2), { x: 1, y: 0, z: 0 });

  const second = prediction.reconcile(
    2,
    { x: 0, y: 0, z: 0 },
    first.position
  );
  assert.deepEqual(second.position, { x: 0, y: 0, z: 0 });
});

test("duplicate and older acknowledgements never apply twice", () => {
  const prediction = new ClientPrediction();
  prediction.record(4, { x: 4, y: 0, z: 0 });
  prediction.reconcile(4, { x: 3, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });

  assert.equal(prediction.reconcile(4, { x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }), null);
  assert.equal(prediction.reconcile(3, { x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }), null);
});

test("round reset clears stale prediction history", () => {
  const prediction = new ClientPrediction();
  prediction.record(7, { x: 7, y: 0, z: 0 });
  prediction.reset(7);

  assert.equal(prediction.history.size, 0);
  assert.equal(prediction.reconcile(7, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), null);
});
