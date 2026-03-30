const FAST_RECONNECT_DELAYS_MS = [0, 5000, 10000];
const SLOW_RECONNECT_DELAYS_MS = [30000, 30000, 30000, 30000, 30000];
const RECONNECT_DELAYS_MS = [
  ...FAST_RECONNECT_DELAYS_MS,
  ...SLOW_RECONNECT_DELAYS_MS
];

function getReconnectPlan(attemptIndex) {
  if (!Number.isInteger(attemptIndex) || attemptIndex < 0 || attemptIndex >= RECONNECT_DELAYS_MS.length) {
    return null;
  }

  const delayMs = RECONNECT_DELAYS_MS[attemptIndex];
  const attemptNumber = attemptIndex + 1;

  return {
    delayMs,
    attemptNumber,
    totalAttempts: RECONNECT_DELAYS_MS.length,
    phase: attemptIndex < FAST_RECONNECT_DELAYS_MS.length ? 'fast' : 'slow'
  };
}

module.exports = {
  RECONNECT_DELAYS_MS,
  getReconnectPlan
};
