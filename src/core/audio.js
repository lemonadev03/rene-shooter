// ===== audio (tiny synth) =====
let AC = null;
function ac() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === "suspended") AC.resume();
  return AC;
}
function beep(f, d, type = "square", vol = 0.06, slide = 0) {
  try {
    const a = ac(),
      o = a.createOscillator(),
      g = a.createGain();
    o.type = type;
    o.frequency.value = f;
    if (slide)
      o.frequency.exponentialRampToValueAtTime(
        Math.max(30, f + slide),
        a.currentTime + d,
      );
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + d);
    o.connect(g);
    g.connect(a.destination);
    o.start();
    o.stop(a.currentTime + d);
  } catch (e) {}
}
function noiseHit(d = 0.18, vol = 0.12, fc = 2500) {
  try {
    const a = ac(),
      len = a.sampleRate * d,
      buf = a.createBuffer(1, len, a.sampleRate),
      ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource();
    s.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = fc;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + d);
    s.connect(f);
    f.connect(g);
    g.connect(a.destination);
    s.start();
  } catch (e) {}
}

export { ac, beep, noiseHit };
