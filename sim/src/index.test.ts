import assert from "node:assert/strict";
import test from "node:test";
import { SIM_TICK_HZ, TICK_MS } from "./index.js";

test("simulation tick rate is fixed", () => {
  assert.equal(SIM_TICK_HZ, 10);
  assert.equal(TICK_MS, 100);
});
