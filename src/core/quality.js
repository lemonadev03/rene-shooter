// @ts-check
const tiers = {
  low: { pixelRatioCap: 0.85, shadowSize: 1024, gtao: false, bloomScale: 0.25 },
  medium: { pixelRatioCap: 1, shadowSize: 2048, gtao: false, bloomScale: 0.4 },
  high: { pixelRatioCap: 1.25, shadowSize: 4096, gtao: true, bloomScale: 0.5 },
  ultra: { pixelRatioCap: 1.5, shadowSize: 4096, gtao: true, bloomScale: 0.75 },
};
/** @type {keyof typeof tiers} */
const requested = /** @type {any} */ (
  new URLSearchParams(location.search).get("q")
);
const overridden = Object.hasOwn(tiers, requested);
/**
 * Live settings: the active tier's values plus the measured frame budget.
 * @type {{ tier: string, automatic: boolean, targetFrameMs: number, renderScale: number,
 * warmingUp: boolean, pixelRatioCap: number, shadowSize: number, gtao: boolean,
 * bloomScale: number, measuredIntervalMs?: number, warmupFrameMs?: number }}
 */
export const quality = {
  tier: overridden ? requested : "high",
  automatic: !overridden,
  targetFrameMs: 1000 / 120,
  renderScale: 1,
  warmingUp: true,
  ...tiers[overridden ? requested : "high"],
};
/** @param {keyof typeof tiers} tier */
export function setQuality(tier) {
  Object.assign(quality, { tier }, tiers[tier]);
}
export function qualityCap() {
  return Math.min(devicePixelRatio || 1, quality.pixelRatioCap);
}

/** @param {() => void} [paint] */
export async function measureDisplayInterval(paint) {
  /** @type {number[]} */
  const deltas = [];
  /** @type {number | undefined} */
  let previous;
  await /** @type {Promise<void>} */ (
    new Promise((resolve) => {
      /** @param {number} now */
      function tick(now) {
        if (previous !== undefined) deltas.push(now - previous);
        previous = now;
        paint?.();
        if (deltas.length < 32) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    })
  );
  deltas.sort((a, b) => a - b);
  quality.measuredIntervalMs = deltas[16];
  // Unthrottled/headless rAF can run faster than a physical display. Budget 120 Hz there.
  quality.targetFrameMs = Math.max(1000 / 120, Math.min(1000 / 30, deltas[16]));
}

/** @param {number[]} frameDeltas */
export function pickQuality(frameDeltas) {
  const sorted = [...frameDeltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  quality.warmupFrameMs = median;
  if (quality.automatic) {
    const interval = /** @type {number} */ (quality.measuredIntervalMs);
    if (interval < 4) {
      // Unthrottled (no vsync): rAF runs ahead of the GPU, so deltas under-report.
      // Auto never picks ultra (ask with ?q=ultra); high plus dynamic resolution holds 120 fps.
      const budget = 1000 / 120;
      setQuality(
        median < budget * 0.9
          ? "high"
          : median < budget * 1.6
            ? "medium"
            : "low",
      );
    } else {
      // Vsync caps deltas at the display interval, so only missed frames show up.
      // Stay on high while it keeps pace; dynamic resolution absorbs small shortfalls.
      setQuality(
        median <= interval * 1.25
          ? "high"
          : median <= interval * 2.2
            ? "medium"
            : "low",
      );
    }
  }
  quality.warmingUp = false;
}
