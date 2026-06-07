import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isScorableTrial } from '../runner/run-manifest-builder.mjs';

// Mirrors the exact shape run-accuracy.mjs builds from a results.json run object.
const gate = (run) => isScorableTrial({
  manifest: { reachabilityStatus: run.reachabilityStatus },
  scratchFiles: run.degradedMarkers ?? [],
  zeroByteFetcherOutput: run.zeroByteFetcherOutput ?? false,
});

test('ok run is scorable', () => {
  assert.equal(gate({ reachabilityStatus: 'ok', degradedMarkers: [], zeroByteFetcherOutput: false }), true);
});
test('fail run is not scorable', () => {
  assert.equal(gate({ reachabilityStatus: 'fail' }), false);
});
test('degraded-marker run is not scorable even if reachabilityStatus ok', () => {
  assert.equal(gate({ reachabilityStatus: 'ok', degradedMarkers: ['mcp-probe.sh'] }), false);
});
test('zero-byte fetcher output is not scorable', () => {
  assert.equal(gate({ reachabilityStatus: 'ok', zeroByteFetcherOutput: true }), false);
});
test('legacy run (no reachability fields) is not "scorable" by the strict predicate', () => {
  // run-accuracy treats this as legacy → scores with a warning; the predicate itself returns false.
  assert.equal(gate({}), false);
});
