# RENE SHOOTER — Beach Soak Showdown

![RENE SHOOTER key art — Rene in a #2 jersey soaking fire monsters with a super soaker on a tropical beach](assets/og-art.jpg)

**▶ Play it live: https://lemonadev03.github.io/rene-shooter/**

A third-person beach shooter built with Three.js. You play Rene: a 3D model based on the Ateneo #2 photo (white "ATENEO" #2 jersey with "RENE" on the back, blue shorts, grey knee brace on the left leg, white shoes), armed with a super soaker, fighting waves of fire monsters on a beach.

Powerups drop around the beach (⚡ Rapid Soak, 💥 Mega Soak, 👟 Speed Soda, ❤️ +40 HP, 🧊 Deep Freeze). Refill at the wandering inflatable beach pools or with a quick ocean dip — but don't camp in the ocean: after a 4-second grace dip, the rip current drains HP harder the longer you stay in, so keep roaming the island.

Eight monster types, each with its own trick: zigzag **Imps**; **Brutes** that ground-slam (jump to dodge); fireball **Spitters** (burst-fire on later waves); **Dashers** that telegraph then lunge; **Boomers** that light a fuse and explode up close; **Splitters** that pop into two imps; **Wardens** hiding behind breakable obsidian shields; and **Shamans** that heal their pack — kill them first. Waves ramp in count, HP, and speed across all five waves.

## Run

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory .
```

Open http://127.0.0.1:8765/index.html

## Controls

- WASD move, mouse look (pointer lock; drag also works)
- LMB soak, RMB aim (shoulder zoom)
- Shift sprint, Space double-jump, Ctrl/C slide
- R refill faster in the ocean or a wandering pool (standing in either refills automatically)
- 1 / 2 switch Stream / Burst
- Touch: virtual joystick + FIRE/AIM/JUMP buttons

Survive 5 waves: fire imps, brutes (wave 2+), and fireball spitters (wave 3+).

Files: `index.html`, `style.css`, `game.js` (Three.js 0.160 via CDN import map).
