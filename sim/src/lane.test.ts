import assert from "node:assert/strict";
import test from "node:test";
import { LEFT_LANE, LEFT_NO_BOUNTY, canHit, distanceEntering, pathLength, pointAt } from "./lane.js";

test("the left lane reaches the king after the no-bounty gate", () => {
  const length = pathLength(LEFT_LANE);
  const gate = distanceEntering(LEFT_LANE, LEFT_NO_BOUNTY);
  assert.ok(gate > 0);
  assert.ok(gate < length);
  const king = pointAt(LEFT_LANE, length);
  assert.equal(king.x, -3520);
  assert.equal(king.y, -3264);
});

test("weapon range includes the target collision", () => {
  assert.equal(canHit(0, 0, 90, 100, 0, 12), true);
  assert.equal(canHit(0, 0, 90, 103, 0, 12), false);
});
