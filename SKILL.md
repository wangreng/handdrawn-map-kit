---
name: handdrawn-map-kit
description: Generate Mizielinski-style hand-drawn illustrated cultural maps from declarative JSON/YAML specs using the handdrawn-map CLI and structured layout diagnostics.
---

# Hand-Drawn Cultural Map Authoring Skill (`handdrawn-map-kit`)

Use this skill to author, inspect, diagnose, and render hand-drawn illustrated cultural maps with `handdrawn-map-kit`.

## Coordinate System

- All layout, drawing, and diagnostic coordinates are in **millimetres (mm)** with top-left origin `(0, 0)`, `+x` right, `+y` down.
- Default sheet: `300 × 200 mm`, `pad = 4.8 mm`, `inner = 8.0 mm`, safe drawable frame `[8, 8, 292, 192]`.
- Geographic coordinates use `[lon, lat]` (degrees) and are projected automatically when `geo.fit` or `geo.projection` is specified.
- Hard resolution cap: `Math.round(w * ppm) * Math.round(h * ppm) <= 18.5e6` pixels (`--fast` is `ppm = 5`, `--hd` is `ppm = 10`).

## CLI Commands

### 1. Discover Built-in Assets (`inspect`)

Always query real country codes, bounding boxes, elements, and flags before drafting a spec:

```bash
# Search Natural Earth countries (id, iso2, name, continent, mainBBox)
handdrawn-map inspect countries korea --json

# List all built-in illustrated elements (with unscaled mm bounds) and person poses
handdrawn-map inspect elements --json

# List built-in waving flag codes for cartouches
handdrawn-map inspect flags --json

# Validate & plan a spec without rasterizing (fast layout & projection check)
handdrawn-map inspect spec my-map.yaml --json
```

### 2. Render & Collect Diagnostics (`render`)

```bash
# Fast preview with structured layout diagnostics piped to stdout
handdrawn-map render my-map.yaml -o out/my-map-fast.png --fast --diagnostics -

# Write diagnostics to a file
handdrawn-map render my-map.yaml -o out/my-map-fast.png --fast --diagnostics out/my-map.diag.json

# Final high-definition render (3000×2000 px at default 300×200 mm)
handdrawn-map render my-map.yaml -o out/my-map-hd.png --hd
```

Supported flags for `render`:
- `-o, --out <file>`: output PNG path (defaults to `out/<meta.id-or-stem>.png`).
- `--fast`: `ppm = 5` (`1500 × 1000 px` on default sheet).
- `--hd`: `ppm = 10` (`3000 × 2000 px` on default sheet).
- `--ppm <n>`: explicit pixels-per-mm override.
- `--diagnostics <file.json|->`: emit layout diagnostics JSON (`-` writes pure JSON to `stdout` and summary to `stderr`).
- `--seed <str>`: deterministic RNG seed override.
- `--no-border`: omit the zebra neatline border (expands safe frame to full sheet).
- `--auto-layout`: enable automatic placement hints.

## Declarative Spec Schema (`schemaVersion: 1`)

Specs can be written in **YAML** (`.yaml`/`.yml`) or **JSON** (`.json`). Top-level aliases `page` → `canvas`, `region` → `geo`, and `theme` → `style` are automatically normalized.

```yaml
schemaVersion: 1

meta:
  id: korea-cultural
  title: SOUTH KOREA
  seed: korea-1

canvas:
  w: 300
  h: 200
  ppm: 10
  paper: hotpress      # cartridge | cream | hotpress | grey | kraft | ...
  border: true

style:
  palette:
    land: '#efe2c3'
    ocean: '#c9dfea'

geo:
  fit:
    target: KOR        # ISO3/ISO2/country name or [west, south, east, north]
    margin: 10
    rotDeg: 0
  focus: [KOR]
  neighbors: true      # true (auto), false, or explicit list like [PRK, JPN, CHN]
  waterlines: true

layers:
  graticule: true
  rivers:
    - pts: [[126.9, 37.55], [127.4, 37.45], [128.1, 37.2]]
      coords: geo
  mountains:
    - peaks: [[160, 95, 7, 5.5, true], [168, 98, 6, 4.5, false]]
  cities:
    - id: seoul
      name: SEOUL
      lon: 126.978
      lat: 37.5665
      capital: true
      dy: -3.0
  waves:
    - { x: 45, y: 120, scale: 1.0, count: 2 }

elements:
  - id: palace
    type: palaceGate
    lon: 126.977
    lat: 37.579
    dx: -12
    dy: 6
    scale: 0.72
    label: Gyeongbokgung
  - id: dancer
    type: hanbok
    x: 118
    y: 128
    scale: 0.52

labels:
  - id: east-sea
    kind: sea
    text: EAST SEA
    x: 235
    y: 95

callouts:
  - from: palace
    to: seoul
    bendY: -2.0

compass:
  x: 266
  y: 162
  r: 9
  angle: auto

cartouche:
  x: 16
  y: 16
  w: 78
  h: 44
  title: SOUTH KOREA
  subtitle: Land of the Morning Calm
  flag: KOR
  facts:
    - Capital: Seoul
    - Currency: Won (KRW)
```

## Iterative AI Authoring Loop (`--fast --diagnostics`)

Follow this tight feedback loop when generating any new map:

1. **Inspect**: Run `handdrawn-map inspect countries <name> --json`, `inspect elements --json`, and `inspect flags --json` to ground country codes, coordinates, and asset names.
2. **Draft Spec**: Write `<map>.yaml` placing focus geography, cities, elements, labels, compass, and cartouche.
3. **Plan (Zero-Raster Check)**: Run `handdrawn-map inspect spec <map>.yaml --json` to verify schema validity and get initial projected bounding boxes and `emptyRegions`.
4. **Fast Render + Diagnostics**: Run `handdrawn-map render <map>.yaml -o out/<map>-fast.png --fast --diagnostics -`.
5. **Diagnose & Fix**: Inspect the diagnostics JSON:
   - `overlaps`: Look at `severity` (`high`/`medium`/`low`), `areaMm2`, and suggested separation vector `(dxMm, dyMm)`. Adjust `dx`/`dy` or coordinates to eliminate overlaps.
   - `outOfBounds`: Look at `overflow.{left,top,right,bottom}` and pull items inside `canvas.safeFrame`.
   - `emptyRegions`: Pick large `sea` regions (tagged by `corner`: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center`) to place `cartouche`, `compass`, and `insets` cleanly over open water.
6. **Final HD Render**: Once `overlapCount === 0` and `outOfBoundsCount === 0`, render the final plate with `--hd`.
