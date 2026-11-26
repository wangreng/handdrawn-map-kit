# handdrawn-map-kit

An **AI/Agent-driven hand-drawn illustrated cultural map engine** in Node.js — inspired by Aleksandra & Daniel Mizielinski's *Maps* (*《地图（人文版）》*), built on a performance-tuned dry-media engine (paper tooth, pencil, technical pen, watercolor wash) extracted from [kevintngo/statechart-art](https://github.com/kevintngo/statechart-art) (MIT).

Minimal runtime dependencies: `@napi-rs/canvas` (2D rasterization) and `js-yaml` (declarative YAML specs).

![Japan Hand-Drawn Cartographic Cultural Atlas](docs/japan_cultural_map.png)

![Korea Hand-Drawn Cartographic Cultural Atlas](docs/korea_cultural_map.png)

## Features

- **Declarative JSON/YAML Spec + CLI (`handdrawn-map`) + Agent Skill (`SKILL.md`)**: Author full cultural maps declaratively in YAML or JSON, inspect built-in assets & Natural Earth geography via CLI, and iterate using structured **Layout Diagnostics JSON** (`--diagnostics`).
- **Multi-Layer Natural Earth Geography**: Bundled Natural Earth datasets (`data/`) cover 1:50m countries, 1:10m simplified **admin-1 states & provinces** (251 countries with `zh`/ISO-3166-2 support), **major rivers**, **lakes**, **populated places** (with `zh`/`ja`/`ko` names & capitals), and **elevation peaks & mountain ranges** — so agents reference real features by name instead of hallucinating coordinates.
- **Inline SVG Dry-Media Renderer (`src/svgDraw.js`)**: Zero-dependency SVG `<path d>` & basic shapes (`<svg>`, `<g>`, `<circle>`, `<ellipse>`, `<rect>`, `<polygon>`, `<polyline>`, `<line>`, `transform`, style inheritance) rendered through the pencil, watercolor wash, and hatching dry-media engine — define custom local landmarks inline when built-ins don't cover them.
- **65 Built-in Cultural, Landmark, Animal & Culinary Illustrations**: 43 classic East Asian & cartographic icons plus 22 new China, Europe, and world icons (`pavilion`, `greatWall`, `archBridge`, `lantern`, `panda`, `dumplings`, `teapot`, `cathedral`, `europeanCastle`, `windmill`, `romanArch`, `vineyard`, `oliveTree`, `cheeseWine`, `palmTree`, `volcano`, `waterfall`, `train`, `ship`, `hotAirBalloon`, `fish`, `yurt`), each reporting exact mm bounding boxes (`ELEMENT_BOUNDS`, `ELEMENT_META`, `elementBBox`), plus parameterized hand-drawn characters (`person`).
- **CJK & Multilingual Hand-Drawn Typography**: Bundled `ZCOOL XiaoWei` (`engine/fonts/ZCOOLXiaoWei-Regular.ttf`, SIL OFL 1.1) + OS CJK font discovery + `registerFont()`, script-aware mixed Latin/Han/Kana/Hangul rendering, accurate `measureBox()`, **bilingual stacked/inline labels** (`writeBilingual`), **curved path labels** (`writeAlongPath`), rotated labels, and CJK-safe cartouches & inset boxes.
- **Auto-Placement & Collision Avoidance (`src/layout.js`)**: Automatic empty-space placement (`placement: 'auto'`) preferring open sea with graceful landlocked fallback, priority-aware collision avoidance (`--auto-layout` / `layout.avoidOverlap`), callout routing, and structured mm bounding-box diagnostics.
- **10 Multi-Style Rendering Presets (`src/styles.js`) & Procedural Media Primitives (`src/mapPrimitives.js`)**: Switch entire maps — including all 65 palette-harmonized icons — with one option (`style.preset` or `--style`):
  - **`vintage-atlas`** (*Maps*): hotpress paper, technical fineliner, colored pencil fill, zebra neatline border.
  - **`blueprint`**: cyanotype navy paper, white/cyan gel ink, technical grid & crosshairs.
  - **`nocturne`**: midnight obsidian paper, starfield ocean, antique gold gel ink, celestial frame.
  - **`ink-wash`**: aged xuan-paper, dynamic sumi `brush` with flying-white, mineral celadon `washBloom`, scroll frame & vermilion seal.
  - **`collage-atlas`** (*City Atlas*): procedural vintage collage patterns (`fillCollage`: halftone dots, stripes, linen, speckle) with cut-paper micro-seams & stamp cartouche.
  - **`gouache-stage`** (*Atlas of Adventures*): borderless full-bleed stage, opaque dry-brush gouache (`fillDryGouache` / `dryBrushStroke`), high-saturation lineless color blocking.
  - **`editorial-infographic`** (*The 50 States*): distressed risograph grain (`fillSoftGrain`), color-coded `admin1.colorBy: 'region'` zones, and `layout.mode: 'sidebar-infographic'` data cards.
  - **`watercolor-field`** (*Everything & Everywhere*): granulated cotton paper, true Beer-Lambert wet-on-wet multiply watercolor (`fillWatercolorMultiply`), loose 2B `graphite` sketch lines & `layout.mode: 'sidebar-specimens'` flat-lay bar.
  - **`anno-scroll`** (*Anno's Journey*): ultra-fine sepia crowquill pen, whisper-pale multiply watercolor tints, optional `oblique: true` 45° parallel-perspective projection & hairline scroll frame.
  - **`paper-relief`** (*If You Lived Here*): Z-stacked matte cardstock (`cutPaperLayer`) with unified top-left studio lighting, Gaussian drop shadows, lit beveled rims & `shadow-box` museum mat frame.

## Quick Start

```bash
npm install

# Render declarative YAML cultural map specs via CLI
npx handdrawn-map render examples/specs/sichuan.yaml -o out/sichuan.png --fast --auto-layout --diagnostics out/sichuan.diag.json
npx handdrawn-map render examples/specs/italy.yaml -o out/italy.png --fast --auto-layout --diagnostics out/italy.diag.json

# Switch visual style presets on any spec (10 built-in presets)
npx handdrawn-map render examples/specs/italy.yaml --style blueprint -o out/italy-blueprint.png --fast --auto-layout
npx handdrawn-map render examples/specs/italy.yaml --style paper-relief -o out/italy-papercut.png --fast --auto-layout
npx handdrawn-map render examples/specs/italy.yaml --style watercolor-field -o out/italy-watercolor.png --fast --auto-layout
npx handdrawn-map render examples/specs/sichuan.yaml --style ink-wash -o out/sichuan-inkwash.png --fast --auto-layout

# Inspect bundled Natural Earth geography, elements, flags, fonts, and styles
npx handdrawn-map inspect admin1 China --json
npx handdrawn-map inspect places Italy --json
npx handdrawn-map inspect rivers Yangtze --json
npx handdrawn-map inspect elements --json
npx handdrawn-map inspect fonts --json
npx handdrawn-map inspect styles --json

# Classic JS atlas demos
npm run demo            # Japan fast preview (1500x1000 px) -> out/japan_cultural_map.png
npm run demo:hd         # Japan HD (3000x2000 px)
npm run demo:korea      # Korea fast preview -> out/korea_cultural_map.png
npm run demo:korea:hd   # Korea HD (3000x2000 px)
```

## Declarative Spec Example (YAML)

See [`examples/specs/sichuan.yaml`](examples/specs/sichuan.yaml) (Chinese province cultural map with admin-1 highlight, CJK bilingual labels, and inline SVG Sanxingdui mask) and [`examples/specs/italy.yaml`](examples/specs/italy.yaml) (European country cultural map with Natural Earth rivers/admin-1, built-in icons, and inline SVG Colosseum).

For AI agents, see [`SKILL.md`](SKILL.md) for the complete authoring schema and `--fast --auto-layout --diagnostics` iterative loop.

## Programmatic JS API

```js
const { createMap } = require('handdrawn-map-kit');

async function main() {
  const map = createMap({ w: 300, h: 200, seed: 'italy-01' });

  // Fit to a country, admin-1 ({ country, admin1 }), or [west, south, east, north] bbox
  const proj = map.fitProjection('Italy');
  map.graticule(proj);

  // Coastline + borders + admin-1 + rivers + lakes from Natural Earth
  map.countries(proj, { focus: 'Italy' });
  map.admin1(proj, { country: 'Italy', bordersOnly: true });
  map.geoRivers(proj, { maxRank: 6 });
  map.geoLakes(proj);

  const [x, y] = proj(12.496, 41.902);
  map.city(x, y, 'Roma', { capital: true });

  map.cartouche(13.5, 13, 88, 44, {
    country: 'ITALIA',
    flag: 'ITA',
    capital: 'Roma',
    mmPerKm: proj.mmPerKm,
  });
  await map.save('out/italy.png');
}
main();
```

## Using It From Another Project

```bash
npm install github:wangreng/handdrawn-map-kit
```

```js
const {
  createMap,
  loadSpec,
  validateSpec,
  renderSpec,
  createLayout,
  drawSvg,
  measureSvg,
  writeBilingual,
  writeAlongPath,
  PALETTE,
} = require('handdrawn-map-kit');
```

## Development & Testing

```bash
npm run lint       # ESLint
npm test           # Fast unit test suite (test/*.test.js)
npm run test:e2e   # Opaque-box E2E test suite (test/e2e/*.e2e.js)
```

## Directory Structure

- `bin/cli.js` — `handdrawn-map` CLI (`render`, `inspect`)
- `src/index.js` — Main `createMap()` entry point & public exports
- `src/spec.js` — Declarative JSON/YAML Spec loader, validator, planner, and renderer
- `src/layout.js` — mm BBox tracker, spatial OccupancyGrid, diagnostics JSON, auto-placement, collision avoidance & callout routing
- `src/geo.js` — Natural Earth admin-0, admin-1, rivers, lakes, populated places, landforms & `resolveRegion`
- `src/svgDraw.js` — Zero-dependency SVG `<path d>` & basic shapes dry-media renderer & measurer
- `src/elements.js` — 65 reusable cultural, nature, landmark, transport, animal & food illustrations + `ELEMENT_BOUNDS`/`ELEMENT_META`/`elementBBox`
- `src/mapPrimitives.js` — Projection, graticules, coastal waterlines, zebra border, cartouche, compass, inset box, and paper-tooth wash
- `src/flags.js` — Built-in cartouche flags and flag spec renderer
- `data/` — Bundled Natural Earth datasets (`admin_0`, `admin_1`, `rivers`, `lakes`, `populated_places`, `landforms`), rebuilt via `npm run build:data`
- `examples/specs/` — Declarative YAML cultural map specs (`sichuan.yaml`, `italy.yaml`)
- `examples/` — Programmatic JS atlas demos (`japan_cultural_map.js`, `korea_cultural_map.js`)
- `engine/` — Dry-media & paper simulation engine (`kit/`, `lib/`, `fonts/` including `ZCOOLXiaoWei-Regular.ttf` & `OFL.txt`)
- `SKILL.md` — Agent skill for iterative map authoring

## Credits & License

- **Code**: MIT License.
- **Geographic Data**: Natural Earth (`admin_0`, `admin_1`, `rivers`, `lakes`, `populated_places`, `landforms`) from [Natural Earth](https://www.naturalearthdata.com/) (public domain).
- **Dry-Media Engine & Latin Fonts**: Dry-media simulation (`engine/kit/`), parameterized character rig (`people.js`), and Hershey-derived `Kevin Serif` / `Kevin Sans` fonts originate from [kevintngo/statechart-art](https://github.com/kevintngo/statechart-art) (MIT).
- **Bundled CJK Font**: `ZCOOL XiaoWei` (`engine/fonts/ZCOOLXiaoWei-Regular.ttf`) is licensed under the **SIL Open Font License 1.1** — see [`engine/fonts/OFL.txt`](engine/fonts/OFL.txt) for full license terms.
