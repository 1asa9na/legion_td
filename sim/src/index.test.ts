import assert from "node:assert/strict";
import test from "node:test";
import { SIM_TICK_HZ } from "./index.js";

test("simulation tick rate is fixed", () => {
  assert.equal(SIM_TICK_HZ, 10);
});
