# RENE SHOOTER — Beach Soak Showdown

A third-person beach shooter built with Three.js. You play Rene: a 3D model based on the Ateneo #2 photo (white "ATENEO" #2 jersey with "RENE" on the back, blue shorts, grey knee brace on the left leg, white shoes), armed with a super soaker, fighting waves of fire monsters on a beach.

## Run

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory .
```

Open http://127.0.0.1:8765/index.html

## Controls

- WASD move, mouse look (pointer lock; drag also works)
- LMB soak, RMB aim (shoulder zoom)
- Shift sprint, Space double-jump, Ctrl/C slide
- R refill near the ocean or blue buckets (walking into the ocean refills automatically)
- 1 / 2 switch Stream / Burst
- Touch: virtual joystick + FIRE/AIM/JUMP buttons

Survive 5 waves: fire imps, brutes (wave 2+), and fireball spitters (wave 3+).

Files: `index.html`, `style.css`, `game.js` (Three.js 0.160 via CDN import map).
