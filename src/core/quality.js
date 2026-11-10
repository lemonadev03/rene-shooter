const tiers = {
  low: { pixelRatioCap: 0.85, shadowSize: 1024, gtao: false, bloomScale: 0.25 },
  medium: { pixelRatioCap: 1, shadowSize: 2048, gtao: false, bloomScale: 0.4 },
  high: { pixelRatioCap: 1.25, shadowSize: 4096, gtao: true, bloomScale: 0.5 },
  ultra: { pixelRatioCap: 1.5, shadowSize: 4096, gtao: true, bloomScale: 0.75 },
};
const requested = new URLSearchParams(location.search).get("q");
const overridden = Object.hasOwn(tiers, requested);
export const quality = {
  tier: overridden ? requested : "high",
  automatic: !overridden,
  targetFrameMs: 1000 / 120,
  renderScale: 1,
  warmingUp: true,
  ...tiers[overridden ? requested : "high"],
};
export function setQuality(tier) { Object.assign(quality, { tier }, tiers[tier]); }
export function qualityCap() { return Math.min(devicePixelRatio || 1, quality.pixelRatioCap); }

export async function measureDisplayInterval(paint) {
  const deltas = [];
  let previous;
  await new Promise((resolve) => {
    function tick(now) {
      if (previous !== undefined) deltas.push(now - previous);
      previous = now;
      paint?.();
      if (deltas.length < 32) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
  deltas.sort((a, b) => a - b);
  quality.measuredIntervalMs = deltas[16];
  // Unthrottled/headless rAF can run faster than a physical display. Budget 120 Hz there.
  quality.targetFrameMs = Math.max(1000 / 120, Math.min(1000 / 30, deltas[16]));
}

export function pickQuality(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const cost = sorted[Math.floor(sorted.length * 0.9)];
  quality.warmupFrameMs = cost;
  if (quality.automatic) {
    const budget = Math.min(quality.targetFrameMs, 1000 / 120);
    // Reserve headroom for monsters, projectiles and input during play.
    setQuality(cost < budget * 0.36 ? "ultra"
      : cost < budget * 0.6 ? "high"
        : cost < budget * 1.1 ? "medium" : "low");
  }
  quality.warmingUp = false;
}
