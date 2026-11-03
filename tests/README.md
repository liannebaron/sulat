# Sulat scorer tests

Run from the repo root (needs only Node, no installs):

    node tests/score_test4.js

Should end with `SCORER OK` (about 3 to 4 minutes). It stress-tests the current scorer (`sulat-score.js`,
version `legible-2`) with simulated hands: fair traces, loose beginner attempts, reversed or reordered or
split strokes (should pass, with a tip), and wrong letters, scribbles, straight lines for curves, shifted or
shrunk traces, missing strokes and missing or wrong-side marks (should fail). Use `TRIALS=25 node tests/score_test4.js`
for a bigger run (slow).

## The scorer the family study ran on

`study-v1/sulat-score.strict-6.js` is the strict scorer used in the Nov 1, 2026 family study (it checked stroke
count, mark side, order, direction and shape). To re-run its test:

    node tests/score_test3.js tests/study-v1/sulat-score.strict-6.js

The same scorer is still available in `sulat-score.js` as `opts.strict = true`.

## Honest limits

Simulated hands are not real hands. These tests found problems and set thresholds, but the real checks were
the family study and testing on real devices. The Nov 2 legibility change was tuned on simulated input and
still needs real-hand retests. Known weak spot: a missing short stroke next to a longer one (for example the
second stroke of "ma") is caught about 8 times in 10.
