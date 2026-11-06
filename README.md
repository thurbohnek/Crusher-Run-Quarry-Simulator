# Crusher Run: Quarry Simulator

© 2026 Ørjan Grane (Studio.grane). All rights reserved. See [LICENSE](LICENSE).

A 2D side-view quarry game by Studio.grane. Run a jaw crusher with realistic rock physics: tip loads from the bench, break oversize blocks, keep the motor out of the red and sell crushed aggregate.

## Play

Open `index.html` in a browser. The whole game is one self-contained HTML file.

## Build

The source is in `src/`. To bundle it into a single HTML file:

```
node build.js
```

This writes `rock-crusher.html`. Copy it to `index.html` to update the playable version.

## Source layout

| File | Contents |
|---|---|
| `src/util.js` | Helpers, formatting, currencies |
| `src/phys.js` | Rigid-body physics (convex polygons, island sleeping) |
| `src/rocks.js` | Rock materials, shapes, sprites, fracture |
| `src/machine.js` | Jaw crusher geometry, tiers, teeth and wear |
| `src/sim.js` | Plant simulation: loads, feeder, chamber, belts, piles |
| `src/career.js` | Economy, orders, upgrades, goals |
| `src/audio.js` | Synthesised sound |
| `src/render.js` | Canvas rendering |
| `src/game.js` | UI, input and game flow |
| `src/shell.html` | Page shell and CSS |

## Tests

The scripts in `test/` run headless with Node and Playwright, for example:

```
node test/balance_test.js   # mass balance
node test/err.js            # page errors
node test/perf_browser.js   # frame and step times
```

## Copyright and licence

Copyright © 2026 Ørjan Grane (Studio.grane). All rights reserved.

This is **not** open-source software. The code is published here for viewing
only. You may not copy, modify, redistribute or publish the game, its code or
its assets without written permission. See [LICENSE](LICENSE) for the full
terms and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the fonts the
game uses.

Permissions and enquiries: studio.grane@gmail.com
