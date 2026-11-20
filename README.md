# handdrawn-map-kit

A standalone **hand-drawn illustrated cultural map toolkit** in Node.js — inspired by Aleksandra & Daniel Mizielinski's *Maps* (*《地图（人文版）》*), with a performance-tuned dry-media engine (paper tooth, pencil, technical pen, watercolor wash) extracted from [kevintngo/statechart-art](https://github.com/kevintngo/statechart-art) (MIT).

Zero flowchart/TLA+/Mermaid dependencies — depends solely on `@napi-rs/canvas`.

![Japan Hand-Drawn Cartographic Cultural Atlas](docs/japan_cultural_map.png)

## Features

- **Cartographic Projection & Graticules**: Oblique conformal-like `(lon, lat) -> [x, y]` projection, latitude/longitude curves, and neatline degree labels.
- **Vintage Atlas Styling**:
  - Alternating black/cream **Zebra Neatline Border** with corner rosettes;
  - Morphological shallow-water bathymetric wash + concentric hand-drawn **coastal waterlines**;
  - Framed parchment **Cartouche** (title, waving flag, country facts, map legend, graphical scale bar) & **Inset Map Box**;
  - True-North rotatable **Compass Rose** with rhumb lines.
- **28+ Cultural, Landmark, Animal & Culinary Illustrations**: Mountains, terraced rice fields, bamboo, sakura, pines, torii gates, pagodas, castles, Tokyo Tower, lighthouses, Shinkansen bullet trains, Kitamaebune ships, sumo rings, Shiba Inu, Nara deer, red-crowned cranes, koi carp, whales, ramen/gyudon bowls, sushi, onigiri, dango, matcha, daruma, origami, koinobori, and parameterized hand-drawn characters (`person`).
- **20x Performance Optimized**: Fast paper-tooth-preserving ocean/border washes, broad pencil side-shading on large landmasses, and dirty-bbox contour extraction (~6 seconds for `--fast` preview, ~20 seconds for `3000×2000` HD).

## Quick Start

```bash
npm install
npm run demo       # Fast preview (~6s, 1500x1000 px) -> out/japan_cultural_map.png
npm run demo:hd    # High-res print quality (~20s, 3000x2000 px) -> out/japan_cultural_map.png
```

## Minimal Example

```js
const { createMap, PALETTE: C } = require('./src');

async function main() {
  const map = createMap({ w: 300, h: 200, seed: 'my-atlas-01', paper: 'hotpress' });
  const proj = map.createProjection({ lon0: 137.6, lat0: 38.2, cx: 160, cy: 100, scale: 0.14, rotDeg: 26 });

  map.graticule(proj, { lons: [130, 134, 138, 142], lats: [34, 38, 42] });

  const poly = map.D.curve(proj.pts([[139.0, 35.0], [140.8, 35.7], [140.9, 38.3], [138.9, 37.9]]), true, 0.22);
  map.coastWaterlines([poly]);
  map.part(poly, C.land);

  const [tx, ty] = proj(139.76, 35.68);
  map.el.tokyoTower(tx + 5, ty - 1.5, 0.58);
  map.city(tx, ty, 'Tokyo', { capital: true });

  map.person(tx - 12, ty + 14, 0.5, {
    seed: 'traveler',
    pose: 'wave',
    hair: 'bob',
    hat: 'conical',
    shirt: { color: C.sakura },
  });

  await map.save('out/my_map.png');
}
main();
```

## Directory Structure

- `src/index.js` — Main `createMap()` entry point
- `src/mapPrimitives.js` — Projection, graticules, coastal waterlines, zebra border, cartouche, compass, inset box, and fast paper-tooth wash
- `src/elements.js` — 28 reusable cultural, nature, landmark, transport, animal & food illustrations
- `src/japanGeo.js` — Simplified real `(lon, lat)` coastlines for the Japanese archipelago, Lake Biwa & neighboring mainland
- `examples/japan_cultural_map.js` — Full double-page illustrated atlas of Japan
- `engine/` — Performance-tuned dry-media & paper simulation engine (`kit/`, `lib/`, `fonts/`)

## Credits & License

MIT License. Dry-media simulation (`engine/kit/`), parameterized character rig (`people.js`), and Hershey-derived `Kevin Serif` / `Kevin Sans` fonts originate from [kevintngo/statechart-art](https://github.com/kevintngo/statechart-art) (MIT).
