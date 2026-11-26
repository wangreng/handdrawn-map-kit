'use strict';
const { plate } = require('../engine/lib/storybook');
const { person, POSES } = require('../engine/lib/people');
const D = require('../engine/lib/draw');
const Lt = require('../engine/lib/letter');
const M = require('./mapPrimitives');
const EL = require('./elements');
const SVG = require('./svgDraw');
const ASSETS = require('./assets');
const GEO = require('./geo');
const FLAGS = require('./flags');
const STYLES = require('./styles');

function createMap(opts = {}) {
  const w = opts.w ?? 300;
  const h = opts.h ?? 200;
  const ppm = opts.ppm ?? 10;
  const pad = opts.pad ?? 4.8;
  const inner = opts.inner ?? 8.0;
  const style = opts.style ? STYLES.resolveStyle(opts.style) : null;
  const pal = style ? style.palette : M.PALETTE;

  const P = plate({
    id: opts.id || 'map',
    w,
    h,
    ppm,
    seed: opts.seed || 'map-1',
    paper: opts.paper || (style ? style.paper : 'hotpress'),
    ink: style ? pal.ink : undefined,
    stroke: style ? style.stroke : undefined,
  });
  if (style) {
    P.style = style;
    P.palette = pal;
    if (style.paperGranulation && style.paperGranulation !== 1) {
      const g = style.paperGranulation;
      for (let i = 0; i < P.S.tooth.length; i++) {
        const v = 0.5 + (P.S.tooth[i] - 0.5) * g;
        P.S.tooth[i] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
    }
  }

  if (opts.ocean !== false) {
    const oceanPad = (opts.border === false || style?.border === 'none') ? 0 : pad;
    M.drawOcean(P, { pad: oceanPad, color: typeof opts.ocean === 'string' ? opts.ocean : pal.ocean });
  }

  let graticuleTicks = [];
  const el = {};
  for (const [name, fn] of Object.entries(EL)) {
    if (typeof fn === 'function' && name !== 'elementBBox') {
      el[name] = (...args) => fn(P, ...args);
    }
  }

  return {
    P,
    D,
    PALETTE: pal,
    style,
    POSES,
    part: (poly, color, o) => M.part(P, poly, color, o),
    fillCollage: (polys, color, o) => M.fillCollage(P, polys, color, o),
    fillDryGouache: (polys, color, o) => M.fillDryGouache(P, polys, color, o),
    dryBrushStroke: (pts, color, o) => M.dryBrushStroke(P, pts, color, o),
    fillSoftGrain: (polys, color, o) => M.fillSoftGrain(P, polys, color, o),
    fillWatercolorMultiply: (polys, color, o) => M.fillWatercolorMultiply(P, polys, color, o),
    cutPaperLayer: (polys, color, o) => M.cutPaperLayer(P, polys, color, o),
    infographicSidebar: (box, info) => M.drawInfographicSidebar(P, box, info),
    specimenSidebar: (box, info, fn) => M.drawSpecimenSidebar(P, box, info, fn),
    at: M.at,
    createProjection: M.createProjection,
    // Projection showing `target` (country, admin-1, { country, admin1 }, or [west, south, east, north])
    // as large as fits in `frame` (default: the whole map area inside the border)
    fitProjection(target, rawOpts) {
      const o = rawOpts || {};
      const resolved = GEO.resolveRegion(target, o);
      const bbox = o.fullBBox ? resolved.bbox : resolved.mainBBox;
      const m = inner + (o.margin ?? 6);
      return M.fitProjection(bbox, { ...o, frame: o.frame || [m, m, w - m, h - m] });
    },

    // Natural Earth country outline as smoothed mm rings, ready for part() / coastWaterlines()
    countryRings: (proj, id, o = {}) => M.geoRings(P, proj, GEO.getCountry(id, o.source).polygons, o),
    // Draw `focus` (one country or a list) with its neighbours and coastal waterlines.
    // `color` is one colour for every focus country, or a list matching `focus`.
    // Returns { focus: [{ country, rings }], neighbors: [{ country, rings }] }.
    countries(proj, o = {}) {
      const focus = [].concat(o.focus || []).map((id) => GEO.getCountry(id, o.source));
      const ids = new Set(focus.map((c) => c.id));
      let neighbors = [];
      if (Array.isArray(o.neighbors)) neighbors = o.neighbors.map((id) => GEO.getCountry(id, o.source));
      else if (o.neighbors !== false) neighbors = GEO.countriesInBBox(proj.extent([0, 0, w, h]), o.source);
      const ringsOf = (country) => ({ country, rings: M.geoRings(P, proj, country.polygons, o) });
      const out = {
        focus: focus.map(ringsOf),
        neighbors: neighbors.filter((c) => !ids.has(c.id)).map(ringsOf).filter((n) => n.rings.length),
      };
      const all = [...out.neighbors, ...out.focus].filter((c) => c.rings.length);
      if (o.waterlines !== false && all.length) M.drawCoastWaterlines(P, all.flatMap((c) => c.rings), o.waterlines || {});
      for (const n of out.neighbors) {
        M.part(P, n.rings, o.neighborColor || pal.neighborLand, { pressure: 0.55, passes: 2, blunt: true, nib: 0.26, outlineColor: pal.neighborOutline || '#5c5549' });
      }
      for (const [i, f] of out.focus.entries()) {
        if (!f.rings.length) continue;
        const color = (Array.isArray(o.color) ? o.color[i] : o.color) || pal.land;
        M.part(P, f.rings, color, { pressure: 0.64, passes: 2, blunt: true, nib: 0.32, outlineColor: pal.ink });
      }
      return out;
    },

    // Natural Earth admin-1 (states/provinces) outline as smoothed mm rings
    admin1Rings(proj, id, rawOpts) {
      const o = rawOpts || {};
      return M.geoRings(P, proj, GEO.getAdmin1(id, o).polygons, o);
    },
    // Draw admin-1 regions (filled focus + neighbors, colorBy: 'region' | 'each', or borders-only overlay)
    admin1(proj, rawOpts) {
      const o = rawOpts || {};
      const focus = [].concat(o.focus || []).map((id) => GEO.getAdmin1(id, { country: o.country, source: o.source }));
      const ids = new Set(focus.map((r) => r.id));
      let neighbors = [];
      if (Array.isArray(o.neighbors)) {
        neighbors = o.neighbors.map((id) => GEO.getAdmin1(id, { country: o.country, source: o.source }));
      } else if (o.neighbors !== false) {
        neighbors = GEO.admin1InBBox(o.bbox || proj.extent([0, 0, w, h]), { country: o.country, source: o.source });
      }
      const ringsOf = (region) => ({ region, rings: M.geoRings(P, proj, region.polygons, o) });
      const out = {
        focus: focus.map(ringsOf),
        neighbors: neighbors.filter((r) => !ids.has(r.id)).map(ringsOf).filter((n) => n.rings.length),
      };
      const colorBy = o.colorBy || null;
      const bordersOnly = o.bordersOnly ?? (focus.length === 0 && !o.fill && !colorBy);
      const borderColor = o.borderColor || pal.admin1Border || '#7d7365';
      const borderNib = o.borderNib ?? 0.16;
      const all = [...out.neighbors, ...out.focus].filter((r) => r.rings.length);
      if (o.waterlines && all.length) {
        M.drawCoastWaterlines(P, all.flatMap((r) => r.rings), typeof o.waterlines === 'object' ? o.waterlines : {});
      }

      if (colorBy === 'region' || colorBy === 'each') {
        const regColors = (Array.isArray(o.regionColors) && o.regionColors.length)
          ? o.regionColors
          : (style?.regionPalette || ['#e85a47', '#549e8a', '#3c6ca8', '#f2b830', '#f08943', '#84b067', '#d96c88', '#9065a3']);
        const swatches = style?.collageSwatches || null;
        const MK = require('../engine/lib/mask');

        const groups = [];
        if (colorBy === 'region') {
          const byKey = new Map();
          for (const item of all) {
            const key = item.region.region || item.region.name || item.region.id;
            if (!byKey.has(key)) {
              const g = { key, rings: [] };
              byKey.set(key, g);
              groups.push(g);
            }
            byKey.get(key).rings.push(...item.rings);
          }
        } else {
          for (const item of all) {
            groups.push({ key: item.region.id, rings: item.rings });
          }
        }

        groups.forEach((g, idx) => {
          if (!g.rings.length) return;
          const col = regColors[idx % regColors.length];
          const sw = swatches ? swatches[idx % swatches.length] : null;
          const partOpts = {
            pressure: 0.60,
            passes: 2,
            blunt: true,
            nib: o.nib ?? borderNib,
            outlineColor: borderColor,
            ...(sw ? { pattern: sw.pattern, patternColor: sw.patternColor, cutShadow: false } : {}),
            ...(style?.fill?.mode === 'paper-cut' ? { elevation: 1.15, shadowDark: 0.26 } : {}),
          };
          M.part(P, g.rings, col, partOpts);
          if (style?.fill?.mode === 'soft-grain') {
            const rm = MK.maskOf(P.S, g.rings);
            MK.outline(P.S, P.pen(o.borderNib ?? 0.30, borderColor, 'gel'), rm, { tremor: 0.15, smooth: 0.18 });
          }
        });
        return out;
      }

      if (bordersOnly) {
        for (const item of all) {
          P.outline(item.rings, { nib: borderNib, color: borderColor });
        }
        return out;
      }
      for (const n of out.neighbors) {
        const fill = typeof o.fill === 'string' ? o.fill : (o.neighborColor || pal.neighborLand);
        M.part(P, n.rings, fill, { pressure: 0.52, passes: 2, blunt: true, nib: o.neighborNib ?? 0.20, outlineColor: borderColor });
      }
      for (const [i, f] of out.focus.entries()) {
        if (!f.rings.length) continue;
        const color = (Array.isArray(o.color) ? o.color[i] : o.color) || pal.land;
        M.part(P, f.rings, color, { pressure: 0.64, passes: 2, blunt: true, nib: o.nib ?? 0.30, outlineColor: o.outlineColor || pal.ink });
      }
      return out;
    },

    // Draw Natural Earth rivers within the map extent (or named rivers)
    geoRivers(proj, rawOpts) {
      const o = rawOpts || {};
      const rivers = o.names
        ? [].concat(o.names).map((n) => GEO.findRiver(n, o.source)).filter(Boolean)
        : GEO.riversInBBox(o.bbox || proj.extent([0, 0, w, h]), {
          minRank: o.minRank,
          maxRank: o.maxRank,
          includeLakeCenterlines: o.includeLakeCenterlines,
          source: o.source,
        });
      const out = [];
      for (const river of rivers) {
        const runs = M.geoLines(P, proj, river.lines, o);
        if (!runs.length) continue;
        const nib = typeof o.nib === 'function'
          ? o.nib(river)
          : (o.nib ?? Math.max(0.18, 0.56 - (river.rank ?? 5) * 0.045));
        const color = o.color || pal.river;
        for (const run of runs) {
          if (style?.fill?.mode === 'gouache') {
            M.dryBrushStroke(P, run, color, { width: nib * 3.2, opacity: 0.90, dryness: 0.24 });
          } else if (style?.fill?.mode === 'paper-cut') {
            const ribbon = M.polylineRibbon(run, Math.max(0.45, nib * 1.4));
            if (ribbon) M.cutPaperLayer(P, [ribbon], color, { elevation: 0.55, shadowDark: 0.22, rimLight: 0.18 });
          } else if (style?.fill?.mode === 'soft-grain') {
            P.ink(run, { nib: Math.max(0.28, nib * 1.15), color, tool: 'gel', tremor: o.tremor ?? 0.22 });
          } else {
            P.ink(run, { nib, color, tremor: o.tremor ?? 0.45 });
          }
        }
        out.push({ river, runs });
      }
      return out;
    },

    // Draw Natural Earth lakes within the map extent (or named lakes)
    geoLakes(proj, rawOpts) {
      const o = rawOpts || {};
      const lakes = o.names
        ? [].concat(o.names).map((n) => GEO.findLake(n, o.source)).filter(Boolean)
        : GEO.lakesInBBox(o.bbox || proj.extent([0, 0, w, h]), {
          maxRank: o.maxRank,
          minArea: o.minGeoArea,
          source: o.source,
        });
      const out = [];
      for (const lake of lakes) {
        const rings = M.geoRings(P, proj, lake.polygons, { ...o, minArea: o.minArea ?? 0.3 });
        if (!rings.length) continue;
        M.part(P, rings, o.color || pal.lake, {
          pressure: o.pressure ?? 0.62,
          passes: o.passes ?? 2,
          nib: o.nib ?? 0.16,
          outlineColor: o.outlineColor || pal.lakeOutline || '#4a7a96',
          hatchFill: false,
        });
        out.push({ lake, rings });
      }
      return out;
    },

    // Draw Natural Earth populated places within the map extent (or named places)
    geoCities(proj, rawOpts) {
      const o = rawOpts || {};
      const places = o.names
        ? [].concat(o.names).map((n) => GEO.findPlace(n, { country: o.country, admin1: o.admin1, source: o.source })).filter(Boolean)
        : GEO.placesInBBox(o.bbox || proj.extent([0, 0, w, h]), {
          country: o.country,
          admin1: o.admin1,
          maxRank: o.maxRank,
          minPop: o.minPop,
          capitalsOnly: o.capitalsOnly,
          limit: o.limit ?? 12,
          source: o.source,
        });
      const [x0, y0, x1, y1] = o.frame || [inner + 2, inner + 2, w - inner - 2, h - inner - 2];
      const minSpacing = o.minSpacing ?? 0;
      const pickLabel = (p) => {
        if (o.labels === false) return '';
        if (o.labelLang === 'zh') return p.zh || p.name;
        if (o.labelLang === 'ja') return p.ja || p.name;
        if (o.labelLang === 'ko') return p.ko || p.name;
        return p.name;
      };
      const out = [];
      for (const place of places) {
        const [x, y] = proj(place.lon, place.lat);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        if (minSpacing > 0 && !place.capital && out.some((c) => Math.hypot(c.x - x, c.y - y) < minSpacing)) continue;
        const label = pickLabel(place);
        if (o.draw !== false) {
          M.drawCity(P, x, y, label, { capital: !!place.capital, ...(o.cityOpts || {}) });
        }
        out.push({ place, x, y, label, capital: !!place.capital });
      }
      return out;
    },

    // Draw Natural Earth mountain peaks and range landform chains within the map extent
    geoMountains(proj, rawOpts) {
      const o = rawOpts || {};
      const bbox = o.bbox || proj.extent([0, 0, w, h]);
      const [x0, y0, x1, y1] = o.frame || [inner + 4, inner + 4, w - inner - 4, h - inner - 4];
      const s = o.scale ?? 1;
      const snowElev = o.snowElev ?? 3500;

      const rawPeaks = o.peaks === false
        ? []
        : GEO.peaksInBBox(bbox, { minElev: o.minElev, kind: o.peakKind ?? 'mountain', source: o.source });
      const drawnPeaks = [];
      const peakTuples = [];
      for (const peak of rawPeaks) {
        const [x, y] = proj(peak.lon, peak.lat);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        const elevScale = peak.elevation ? Math.max(0.75, Math.min(1.4, peak.elevation / 4000)) : 1;
        const pw = (o.peakW ?? 4.2) * s * elevScale;
        const ph = (o.peakH ?? 5.0) * s * elevScale;
        peakTuples.push([x, y, pw, ph, (peak.elevation ?? 0) >= snowElev]);
        drawnPeaks.push({ peak, x, y });
      }

      const drawnRanges = [];
      if (o.ranges !== false) {
        const landforms = GEO.landformsInBBox(bbox, {
          kinds: o.kinds || ['Range/mtn'],
          maxRank: o.maxRank,
          source: o.source,
        });
        for (const landform of landforms) {
          const rings = M.geoRings(P, proj, landform.polygons, { ...o, minArea: o.minArea ?? 8 });
          if (!rings.length) continue;
          let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
          for (const [px, py] of rings[0]) {
            if (px < rx0) rx0 = px;
            if (px > rx1) rx1 = px;
            if (py < ry0) ry0 = py;
            if (py > ry1) ry1 = py;
          }
          const spanX = rx1 - rx0, spanY = ry1 - ry0;
          const count = Math.max(2, Math.min(6, Math.round(spanX / (9 * s))));
          const cy = (ry0 + ry1) / 2;
          for (let i = 0; i < count; i++) {
            const t = (i + 0.5) / count;
            const px = rx0 + spanX * (0.18 + 0.64 * t);
            const py = cy + ((i % 2 === 0 ? -1 : 1) * Math.min(2.5, spanY * 0.14));
            if (px < x0 || px > x1 || py < y0 || py > y1) continue;
            peakTuples.push([px, py, (o.peakW ?? 3.6) * s, (o.peakH ?? 4.2) * s, i % 2 === 0]);
          }
          drawnRanges.push({ landform, rings });
        }
      }

      if (peakTuples.length) {
        peakTuples.sort((a, b) => a[1] - b[1]);
        M.drawMountainRange(P, peakTuples, { color: o.color });
      }
      return { peaks: drawnPeaks, ranges: drawnRanges };
    },

    // Cartographic layers
    graticule(proj, o = {}) {
      graticuleTicks = M.drawGraticule(P, proj, { inner, ...o });
      return graticuleTicks;
    },
    coastWaterlines: (polys, o) => M.drawCoastWaterlines(P, polys, o),
    land: (pts, o) => M.drawLand(P, pts, o),
    mountainRange: (peaks, o) => M.drawMountainRange(P, peaks, o),
    riceFields: (cx, cy, w2, h2) => M.drawRiceFields(P, cx, cy, w2, h2),
    river: (pts, o) => M.drawRiver(P, pts, o),
    route: (pts, o) => M.drawRoute(P, pts, o),
    callout: (fromPt, toPt, o) => M.drawCallout(P, fromPt, toPt, o),
    waves: (x, y, s, count) => M.drawWaves(P, x, y, s, count),
    city: (x, y, name, o) => M.drawCity(P, x, y, name, o),
    compass: (cx, cy, r, o) => M.drawCompass(P, cx, cy, r, o),
    cartouche: (x, y, w2, h2, info) => M.drawCartouche(P, x, y, w2, h2, info),
    insetBox: (x, y, w2, h2, title) => M.drawInsetBox(P, x, y, w2, h2, title),

    // Typography
    label(text, x, y, o = {}) {
      const base = { face: 'serif-bold', size: 2.6, align: 'center' };
      if (o.sub) {
        const { sub, bilingualLayout, ...rest } = o;
        return P.writeBilingual(text, sub, x, y, { ...base, ...rest, layout: bilingualLayout || rest.layout || 'stack' });
      }
      return P.text(text, x, y, { ...base, ...o });
    },
    seaLabel(text, x, y, o = {}) {
      const base = { face: 'serif-bold', size: 3.4, align: 'center', color: '#426a80', spacing: 0.16, slant: 0.22 };
      if (o.sub) {
        const { sub, bilingualLayout, ...rest } = o;
        return P.writeBilingual(text, sub, x, y, { ...base, ...rest, layout: bilingualLayout || rest.layout || 'stack' });
      }
      return P.text(text, x, y, { ...base, ...o });
    },
    regionLabel(text, x, y, o = {}) {
      const base = { face: 'serif-bold', size: 2.5, align: 'center', color: '#7a6852', spacing: 0.22 };
      if (o.sub) {
        const { sub, bilingualLayout, ...rest } = o;
        return P.writeBilingual(text, sub, x, y, { ...base, ...rest, layout: bilingualLayout || rest.layout || 'stack' });
      }
      return P.text(text, x, y, { ...base, ...o });
    },
    block: (lines, cx, cy, o = {}) => P.block(lines, cx, cy, { face: 'serif-bold', size: 2.6, align: 'center', ...o }),
    writeAlongPath: (text, pts, o = {}) => P.writeAlongPath(text, pts, { face: 'serif-bold', size: 2.6, ...o }),
    writeBilingual: (primary, secondary, x, y, o = {}) => P.writeBilingual(primary, secondary, x, y, { face: 'serif-bold', size: 2.6, align: 'center', ...o }),
    registerFont: Lt.registerFont,
    measureBox: Lt.measureBox,
    listFonts: Lt.listFonts,

    // Characters, elements & SVG
    person: (x, y, scale = 0.52, o = {}) => person(P, x, y, scale, o),
    svg: (svgOrPaths, x, y, o) => SVG.drawSvg(P, svgOrPaths, x, y, o),
    el,

    async save(filePath, saveOpts = {}) {
      const drawBorder = opts.border !== false && (opts.border === true || style?.border !== 'none');
      if (drawBorder) {
        M.drawZebraBorder(P, { pad, inner, ticks: graticuleTicks });
      }
      return P.finish(filePath, saveOpts);
    },
  };
}

const { loadSpec, validateSpec, planSpec, renderSpec } = require('./spec');
const { createLayout } = require('./layout');

module.exports = {
  createMap,
  createProjection: M.createProjection,
  fitProjection: M.fitProjection,
  PALETTE: M.PALETTE,
  POSES,
  // Procedural media, texture & lighting primitives
  organicBlob: M.organicBlob,
  fillCollage: M.fillCollage,
  fillDryGouache: M.fillDryGouache,
  dryBrushStroke: M.dryBrushStroke,
  fillSoftGrain: M.fillSoftGrain,
  fillWatercolorMultiply: M.fillWatercolorMultiply,
  cutPaperLayer: M.cutPaperLayer,
  drawInfographicSidebar: M.drawInfographicSidebar,
  drawSpecimenSidebar: M.drawSpecimenSidebar,
  // Natural Earth country data
  getCountry: GEO.getCountry,
  findCountry: GEO.findCountry,
  listCountries: GEO.listCountries,
  countriesInBBox: GEO.countriesInBBox,
  loadCountries: GEO.loadCountries,
  // Natural Earth M2 layers: admin-1, rivers, lakes, places, landforms & region resolver
  loadAdmin1: GEO.loadAdmin1,
  getAdmin1: GEO.getAdmin1,
  findAdmin1: GEO.findAdmin1,
  listAdmin1: GEO.listAdmin1,
  admin1InBBox: GEO.admin1InBBox,
  loadRivers: GEO.loadRivers,
  riversInBBox: GEO.riversInBBox,
  findRiver: GEO.findRiver,
  getRiver: GEO.getRiver,
  loadLakes: GEO.loadLakes,
  lakesInBBox: GEO.lakesInBBox,
  findLake: GEO.findLake,
  getLake: GEO.getLake,
  loadPlaces: GEO.loadPlaces,
  placesInBBox: GEO.placesInBBox,
  findPlace: GEO.findPlace,
  getPlace: GEO.getPlace,
  loadLandforms: GEO.loadLandforms,
  peaksInBBox: GEO.peaksInBBox,
  landformsInBBox: GEO.landformsInBBox,
  resolveRegion: GEO.resolveRegion,
  FLAGS: FLAGS.FLAGS,
  // Declarative spec & layout diagnostics
  loadSpec,
  validateSpec,
  planSpec,
  renderSpec,
  createLayout,
  // Typography
  block: Lt.block,
  writeAlongPath: Lt.writeAlongPath,
  writeBilingual: Lt.writeBilingual,
  registerFont: Lt.registerFont,
  measureBox: Lt.measureBox,
  listFonts: Lt.listFonts,
  // SVG dry-media renderer & parser
  drawSvg: SVG.drawSvg,
  parseSvg: SVG.parseSvg,
  parsePathD: SVG.parsePathD,
  measureSvg: SVG.measureSvg,
  // Local-first SVG asset library (private per-user by default)
  getUserAssetsDir: ASSETS.getUserAssetsDir,
  getRepoAssetsDir: ASSETS.getRepoAssetsDir,
  listSvgAssets: ASSETS.listSvgAssets,
  resolveSvgAsset: ASSETS.resolveSvgAsset,
  saveSvgAsset: ASSETS.saveSvgAsset,
  saveAssetsFromSpec: ASSETS.saveAssetsFromSpec,
  // Style presets
  STYLES: STYLES.STYLES,
  STYLE_NAMES: STYLES.STYLE_NAMES,
  getStyle: STYLES.getStyle,
  resolveStyle: STYLES.resolveStyle,
  // Element bounds & metadata
  ELEMENT_BOUNDS: EL.ELEMENT_BOUNDS,
  ELEMENT_META: EL.ELEMENT_META,
  elementBBox: EL.elementBBox,
};
