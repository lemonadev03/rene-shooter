import * as THREE from "three";
import { canvasTex } from "../core/utils.js";

export function makeLabel(main, sub = "", scale = 1) {
  const tex = canvasTex(512, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(4,47,110,.88)";
    g.strokeStyle = "#fff";
    g.lineWidth = 6;
    g.beginPath();
    g.roundRect(14, 14, w - 28, h - 28, 42);
    g.fill();
    g.stroke();
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.font = "900 62px Arial";
    g.fillText(main, w / 2, sub ? 84 : 102);
    if (sub) {
      g.font = "800 36px Arial";
      g.fillStyle = "#7dd3fc";
      g.fillText(sub, w / 2, 132);
    }
  });
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    }),
  );
  sp.scale.set(3.4 * scale, 1.06 * scale, 1);
  return sp;
}
