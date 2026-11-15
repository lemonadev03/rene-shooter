// @ts-check
import * as THREE from "three";
import { canvasTex } from "../core/utils.js";
import { drawIcon } from "../ui/icons.js";

/**
 * @param {string} main
 * @param {string} [sub]
 * @param {number} [scale]
 * @param {import("../ui/icons.js").IconRef} [icon]
 */
export function makeLabel(main, sub = "", scale = 1, icon) {
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
    g.font = "900 62px Arial";
    const baseline = sub ? 84 : 102;
    if (icon) {
      const iconSize = 56;
      const gap = 12;
      const textWidth = g.measureText(main).width;
      const startX = (w - (iconSize + gap + textWidth)) / 2;
      drawIcon(g, icon.name, startX, baseline - 50, iconSize, icon.color);
      g.fillStyle = "#fff";
      g.textAlign = "left";
      g.fillText(main, startX + iconSize + gap, baseline);
    } else {
      g.textAlign = "center";
      g.fillText(main, w / 2, baseline);
    }
    if (sub) {
      g.font = "800 36px Arial";
      g.fillStyle = "#7dd3fc";
      g.textAlign = "center";
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
