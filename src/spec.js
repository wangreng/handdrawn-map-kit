'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const Lt = require('../engine/lib/letter');
const { PAPERS } = require('../engine/kit/paper');
const { POSES } = require('../engine/lib/people');
const M = require('./mapPrimitives');
const EL = require('./elements');
const GEO = require('./geo');
const FLAGS = require('./flags');
const {
  createLayout,
  normalizeBBox,
  bboxFromPoints,
  estimateElementBox,
} = require('./layout');

const MAX_PIXELS = 18.5e6;

const KNOWN_TOP_KEYS = new Set([
  'schemaVersion',
  'meta',
  'canvas',
  'style',
  'geo',
  'layers',
  'elements',
  'labels',
  'callouts',
  'cartouche',
  'compass',
  'insets',
  'layout',
]);

const ALIAS_MAP = {
  page: 'canvas',
  region: 'geo',
  theme: 'style',
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepClone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(deepClone);
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    out[k] = deepClone(val);
  }
  return out;
}

function normalizeAliases(obj, warnings) {
  for (const [alias, canonical] of Object.entries(ALIAS_MAP)) {
    if (Object.hasOwn(obj, alias)) {
      if (Object.hasOwn(obj, canonical)) {
        warnings.push(`Both "${canonical}" and alias "${alias}" are present; using "${canonical}".`);
      } else {
        obj[canonical] = obj[alias];
      }
      delete obj[alias];
    }
  }
}

function normalizeCartoucheFacts(facts) {
  if (!Array.isArray(facts)) return facts;
  const out = [];
  for (const entry of facts) {
    if (entry === null || entry === undefined) continue;
    if (typeof entry === 'string') {
      out.push(entry);
    } else if (Array.isArray(entry)) {
      if (entry.length >= 2) out.push(`${entry[0]}: ${entry[1]}`);
      else if (entry.length === 1 && entry[0] !== null && entry[0] !== undefined) out.push(String(entry[0]));
    } else if (isPlainObject(entry)) {
      for (const [k, v] of Object.entries(entry)) {
        if (v === null || v === undefined) continue;
        out.push(`${k}: ${v}`);
      }
    } else {
      out.push(String(entry));
    }
  }
  return out;
}

function loadSpec(pathOrObj) {
  let raw;
  let sourcePath = null;
  let baseDir = null;

  if (typeof pathOrObj === 'string') {
    sourcePath = path.resolve(pathOrObj);
    baseDir = path.dirname(sourcePath);
    const text = fs.readFileSync(sourcePath, 'utf8');
    const ext = path.extname(sourcePath).toLowerCase();
    if (ext === '.yaml' || ext === '.yml') {
      raw = yaml.load(text);
    } else if (ext === '.json') {
      raw = JSON.parse(text);
    } else {
      try {
        raw = JSON.parse(text);
      } catch {
        raw = yaml.load(text);
      }
    }
    if (!isPlainObject(raw)) {
      throw new Error(`Spec file "${pathOrObj}" must parse to a plain object.`);
    }
  } else if (isPlainObject(pathOrObj)) {
    raw = deepClone(pathOrObj);
    if (pathOrObj.__baseDir) baseDir = pathOrObj.__baseDir;
    if (pathOrObj.__sourcePath) sourcePath = pathOrObj.__sourcePath;
  } else {
    throw new TypeError('loadSpec() expects a file path string or a plain spec object.');
  }

  const loadWarnings = [];
  normalizeAliases(raw, loadWarnings);

  if (sourcePath) {
    Object.defineProperty(raw, '__sourcePath', { value: sourcePath, enumerable: false, configurable: true });
  }
  if (baseDir) {
    Object.defineProperty(raw, '__baseDir', { value: baseDir, enumerable: false, configurable: true });
  }
  if (loadWarnings.length) {
    Object.defineProperty(raw, '__loadWarnings', { value: loadWarnings, enumerable: false, configurable: true });
  }
  return raw;
}

function resolveGeoSource(source, baseDir) {
  if (!source || typeof source !== 'string') return source;
  if (path.isAbsolute(source) || !baseDir) return source;
  return path.resolve(baseDir, source);
}

function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateSpec(inputSpec, opts = {}) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(inputSpec)) {
    return { ok: false, errors: ['Spec must be a plain object.'], warnings, spec: null };
  }

  const baseDir = inputSpec.__baseDir || null;
  const sourcePath = inputSpec.__sourcePath || null;
  if (Array.isArray(inputSpec.__loadWarnings)) {
    warnings.push(...inputSpec.__loadWarnings);
  }

  const spec = deepClone(inputSpec);
  normalizeAliases(spec, warnings);

  for (const key of Object.keys(spec)) {
    if (!KNOWN_TOP_KEYS.has(key)) {
      warnings.push(`Unknown top-level key "${key}" will be ignored.`);
    }
  }

  // schemaVersion
  if (spec.schemaVersion === undefined) {
    spec.schemaVersion = 1;
  } else if (spec.schemaVersion !== 1) {
    errors.push(`Unsupported schemaVersion "${spec.schemaVersion}" (expected 1).`);
  }

  // meta
  spec.meta = isPlainObject(spec.meta) ? spec.meta : {};

  // canvas
  const rawCanvas = isPlainObject(spec.canvas) ? spec.canvas : {};
  const border = opts.border !== undefined ? opts.border : (rawCanvas.border !== false);
  const w = rawCanvas.w ?? 300;
  const h = rawCanvas.h ?? 200;
  const ppm = opts.ppm !== undefined ? opts.ppm : (rawCanvas.ppm ?? 10);
  const pad = rawCanvas.pad ?? (border ? 4.8 : 0);
  const inner = rawCanvas.inner ?? (border ? 8.0 : 0);
  const paper = rawCanvas.paper ?? 'hotpress';
  const ocean = rawCanvas.ocean ?? true;

  if (!isFiniteNum(w) || w <= 0) errors.push(`canvas.w must be a positive number (got ${w}).`);
  if (!isFiniteNum(h) || h <= 0) errors.push(`canvas.h must be a positive number (got ${h}).`);
  if (!isFiniteNum(ppm) || ppm <= 0) errors.push(`canvas.ppm must be a positive number (got ${ppm}).`);
  if (!isFiniteNum(pad) || pad < 0) errors.push(`canvas.pad must be >= 0 (got ${pad}).`);
  if (!isFiniteNum(inner) || inner < 0) errors.push(`canvas.inner must be >= 0 (got ${inner}).`);
  if (isFiniteNum(w) && isFiniteNum(inner) && inner * 2 >= w) {
    errors.push(`canvas.inner (${inner}) is too large for canvas.w (${w}).`);
  }
  if (isFiniteNum(h) && isFiniteNum(inner) && inner * 2 >= h) {
    errors.push(`canvas.inner (${inner}) is too large for canvas.h (${h}).`);
  }
  if (isFiniteNum(w) && isFiniteNum(h) && isFiniteNum(ppm) && w > 0 && h > 0 && ppm > 0) {
    const px = Math.round(w * ppm) * Math.round(h * ppm);
    if (px > MAX_PIXELS) {
      errors.push(`Canvas resolution ${Math.round(w * ppm)}x${Math.round(h * ppm)} (${(px / 1e6).toFixed(1)} MP) exceeds hard memory cap of 18.5 MP.`);
    }
  }
  if (typeof paper === 'string') {
    if (!Object.hasOwn(PAPERS, paper)) {
      errors.push(`Unknown canvas.paper "${paper}" (built-in: ${Object.keys(PAPERS).join(', ')}).`);
    }
  } else if (isPlainObject(paper)) {
    if (typeof paper.base !== 'string') {
      errors.push('Custom canvas.paper object requires a "base" hex color string.');
    }
  } else {
    errors.push('canvas.paper must be a preset name string or a custom { base } object.');
  }

  spec.canvas = { w, h, ppm, pad, inner, paper, ocean, border };

  // style
  spec.style = isPlainObject(spec.style) ? spec.style : {};
  if (spec.style.palette !== undefined && !isPlainObject(spec.style.palette)) {
    errors.push('style.palette must be an object mapping color names to hex strings.');
  }

  // geo
  if (spec.geo !== undefined) {
    if (!isPlainObject(spec.geo)) {
      errors.push('geo must be an object.');
    } else {
      const geoSource = resolveGeoSource(spec.geo.fit?.source ?? spec.geo.source, baseDir);
      if (spec.geo.fit !== undefined) {
        if (!isPlainObject(spec.geo.fit)) {
          errors.push('geo.fit must be an object.');
        } else {
          const t = spec.geo.fit.target;
          if (t === undefined || t === null) {
            errors.push('geo.fit.target is required.');
          } else if (Array.isArray(t)) {
            if (t.length !== 4 || !t.every(isFiniteNum) || t[0] >= t[2] || t[1] >= t[3]) {
              errors.push('geo.fit.target bbox must be [west, south, east, north] with west < east and south < north.');
            }
          } else if (typeof t === 'string') {
            if (!GEO.findCountry(t, geoSource)) {
              errors.push(`Unknown country "${t}" in geo.fit.target.`);
            }
          } else if (isPlainObject(t)) {
            // PR 2 extension slot: { country, admin1 }
            if (t.country && typeof t.country === 'string' && !GEO.findCountry(t.country, geoSource)) {
              errors.push(`Unknown country "${t.country}" in geo.fit.target.country.`);
            }
          } else {
            errors.push('geo.fit.target must be a country code/name, [w,s,e,n] bbox, or { country, admin1 } object.');
          }
        }
      }
      if (spec.geo.projection !== undefined) {
        if (!isPlainObject(spec.geo.projection)) {
          errors.push('geo.projection must be an object.');
        } else {
          const p = spec.geo.projection;
          if (!isFiniteNum(p.lon0)) errors.push('geo.projection.lon0 must be a finite number.');
          if (!isFiniteNum(p.lat0)) errors.push('geo.projection.lat0 must be a finite number.');
          if (!isFiniteNum(p.scale) || p.scale <= 0) errors.push('geo.projection.scale must be a positive number.');
        }
      }
      if (spec.geo.focus !== undefined) {
        const list = Array.isArray(spec.geo.focus) ? spec.geo.focus : [spec.geo.focus];
        for (const id of list) {
          if (typeof id !== 'string') {
            errors.push('geo.focus entries must be country code/name strings.');
          } else if (!GEO.findCountry(id, geoSource)) {
            errors.push(`Unknown country "${id}" in geo.focus.`);
          }
        }
      }
      if (Array.isArray(spec.geo.neighbors)) {
        for (const id of spec.geo.neighbors) {
          if (typeof id !== 'string') {
            errors.push('geo.neighbors array entries must be country code/name strings.');
          } else if (!GEO.findCountry(id, geoSource)) {
            errors.push(`Unknown country "${id}" in geo.neighbors.`);
          }
        }
      }
    }
  }

  // layers
  spec.layers = isPlainObject(spec.layers) ? spec.layers : {};
  for (const autoKey of ['rivers', 'lakes', 'mountains', 'cities']) {
    const val = spec.layers[autoKey];
    if (val !== undefined && !Array.isArray(val) && !isPlainObject(val)) {
      errors.push(`layers.${autoKey} must be an array or an { auto: true, ... } config object.`);
    }
  }
  for (const arrKey of ['riceFields', 'routes', 'waves']) {
    const val = spec.layers[arrKey];
    if (val !== undefined && !Array.isArray(val)) {
      errors.push(`layers.${arrKey} must be an array.`);
    }
  }

  // elements
  if (spec.elements !== undefined) {
    if (!Array.isArray(spec.elements)) {
      errors.push('elements must be an array.');
    } else {
      spec.elements.forEach((el, idx) => {
        if (!isPlainObject(el)) {
          errors.push(`elements[${idx}] must be an object.`);
          return;
        }
        if (typeof el.type !== 'string' || !el.type) {
          errors.push(`elements[${idx}].type must be a non-empty string.`);
          return;
        }
        if (el.type === 'svg') {
          if (!el.svg) errors.push(`elements[${idx}] with type "svg" requires an "svg" field.`);
        } else if (el.type === 'person') {
          if (el.options && typeof el.options.pose === 'string' && !Object.hasOwn(POSES, el.options.pose)) {
            warnings.push(`elements[${idx}] references unknown person pose "${el.options.pose}"; falling back to "stand".`);
          }
        } else if (!Object.hasOwn(EL, el.type)) {
          errors.push(`elements[${idx}] has unknown element type "${el.type}".`);
        }

        const hasXY = isFiniteNum(el.x) && isFiniteNum(el.y);
        const hasGeo = isFiniteNum(el.lon) && isFiniteNum(el.lat);
        const hasPlace = typeof el.place === 'string' && el.place.length > 0;
        const isAuto = el.placement === 'auto';
        if (!hasXY && !hasGeo && !hasPlace && !isAuto) {
          errors.push(`elements[${idx}] ("${el.type}") must specify (x, y), (lon, lat), place, or placement: "auto".`);
        }
      });
    }
  } else {
    spec.elements = [];
  }

  // labels
  if (spec.labels !== undefined) {
    if (!Array.isArray(spec.labels)) {
      errors.push('labels must be an array.');
    } else {
      spec.labels.forEach((lbl, idx) => {
        if (!isPlainObject(lbl)) {
          errors.push(`labels[${idx}] must be an object.`);
          return;
        }
        if (typeof lbl.text !== 'string' || !lbl.text.trim()) {
          errors.push(`labels[${idx}].text must be a non-empty string.`);
        }
        const hasXY = isFiniteNum(lbl.x) && isFiniteNum(lbl.y);
        const hasGeo = isFiniteNum(lbl.lon) && isFiniteNum(lbl.lat);
        const hasPath = Array.isArray(lbl.path) && lbl.path.length >= 2;
        const isAuto = lbl.placement === 'auto';
        if (!hasXY && !hasGeo && !hasPath && !isAuto) {
          errors.push(`labels[${idx}] ("${lbl.text || ''}") must specify (x, y), (lon, lat), path, or placement: "auto".`);
        }
      });
    }
  } else {
    spec.labels = [];
  }

  // callouts
  if (spec.callouts !== undefined && !Array.isArray(spec.callouts)) {
    errors.push('callouts must be an array.');
  } else if (!spec.callouts) {
    spec.callouts = [];
  }

  // cartouche
  if (spec.cartouche !== undefined && spec.cartouche !== null) {
    if (!isPlainObject(spec.cartouche)) {
      errors.push('cartouche must be an object.');
    } else {
      const c = spec.cartouche;
      if (c.placement !== 'auto') {
        if (!isFiniteNum(c.x) || !isFiniteNum(c.y)) {
          errors.push('cartouche requires numeric x and y (or placement: "auto").');
        }
      }
      if (!isFiniteNum(c.w) || c.w <= 0 || !isFiniteNum(c.h) || c.h <= 0) {
        errors.push('cartouche requires positive numeric w and h.');
      }
      if (c.flag !== undefined && c.flag !== null) {
        try {
          FLAGS.resolveFlag(c.flag);
        } catch (err) {
          errors.push(`Invalid cartouche.flag: ${err.message}`);
        }
      }
    }
  }

  // compass
  if (spec.compass !== undefined && spec.compass !== null) {
    if (!isPlainObject(spec.compass)) {
      errors.push('compass must be an object.');
    } else {
      const cmp = spec.compass;
      const hasXY = (isFiniteNum(cmp.x) && isFiniteNum(cmp.y)) || (isFiniteNum(cmp.cx) && isFiniteNum(cmp.cy));
      const hasGeo = isFiniteNum(cmp.lon) && isFiniteNum(cmp.lat);
      if (!hasXY && !hasGeo && cmp.placement !== 'auto') {
        errors.push('compass requires (x, y), (lon, lat), or placement: "auto".');
      }
      if (cmp.r !== undefined && (!isFiniteNum(cmp.r) || cmp.r <= 0)) {
        errors.push('compass.r must be a positive number.');
      }
    }
  }

  // insets
  if (spec.insets !== undefined) {
    if (!Array.isArray(spec.insets)) {
      errors.push('insets must be an array.');
    } else {
      spec.insets.forEach((ins, idx) => {
        if (!isPlainObject(ins)) {
          errors.push(`insets[${idx}] must be an object.`);
          return;
        }
        if (!isFiniteNum(ins.x) || !isFiniteNum(ins.y) || !isFiniteNum(ins.w) || ins.w <= 0 || !isFiniteNum(ins.h) || ins.h <= 0) {
          errors.push(`insets[${idx}] requires numeric x, y, and positive w, h.`);
        }
      });
    }
  } else {
    spec.insets = [];
  }

  // layout
  spec.layout = isPlainObject(spec.layout) ? spec.layout : {};
  if (spec.layout.gridStep !== undefined && (!isFiniteNum(spec.layout.gridStep) || spec.layout.gridStep <= 0)) {
    errors.push('layout.gridStep must be a positive number.');
  }
  if (spec.layout.padding !== undefined && (!isFiniteNum(spec.layout.padding) || spec.layout.padding < 0)) {
    errors.push('layout.padding must be >= 0.');
  }

  if (sourcePath) {
    Object.defineProperty(spec, '__sourcePath', { value: sourcePath, enumerable: false, configurable: true });
  }
  if (baseDir) {
    Object.defineProperty(spec, '__baseDir', { value: baseDir, enumerable: false, configurable: true });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    spec,
  };
}

function resolveColor(val, pal) {
  if (typeof val === 'string' && Object.hasOwn(pal, val)) return pal[val];
  return val;
}

function resolvePoint(item, proj, idPositions) {
  if (typeof item === 'string') {
    return idPositions && idPositions.get(item) ? idPositions.get(item) : null;
  }
  if (Array.isArray(item) && item.length >= 2 && isFiniteNum(item[0]) && isFiniteNum(item[1])) {
    return [item[0], item[1]];
  }
  if (!isPlainObject(item)) return null;
  const dx = isFiniteNum(item.dx) ? item.dx : 0;
  const dy = isFiniteNum(item.dy) ? item.dy : 0;
  if (isFiniteNum(item.lon) && isFiniteNum(item.lat)) {
    if (!proj) return null;
    const [px, py] = proj(item.lon, item.lat);
    return [px + dx, py + dy];
  }
  if (isFiniteNum(item.x) && isFiniteNum(item.y)) {
    return [item.x + dx, item.y + dy];
  }
  if (isFiniteNum(item.cx) && isFiniteNum(item.cy)) {
    return [item.cx + dx, item.cy + dy];
  }
  return null;
}

function resolvePathPoints(entry, proj) {
  const rawPts = Array.isArray(entry) ? entry : (entry.pts || entry.points || entry.geoPts || []);
  const isGeo = !Array.isArray(entry) && (entry.coords === 'geo' || Boolean(entry.geoPts));
  const out = [];
  for (const pt of rawPts) {
    if (Array.isArray(pt) && pt.length >= 2) {
      if (isGeo && proj) out.push(proj(pt[0], pt[1]));
      else out.push([pt[0], pt[1]]);
    } else if (isPlainObject(pt)) {
      const p = resolvePoint(pt, proj);
      if (p) out.push(p);
    }
  }
  return out;
}

function estimateTextBBox(text, x, y, o = {}) {
  const face = o.face || 'serif-bold';
  const size = o.size || 2.6;
  const spacing = o.spacing || 0;
  const slant = o.slant || 0;
  const w = Lt.measure(text, face, size, spacing);
  const h = size;
  const alignOff = o.align === 'center' ? w / 2 : o.align === 'right' ? w : 0;
  const x0 = x - alignOff - size * slant * 0.62;
  const y0 = y - size;
  return normalizeBBox(x0, y0, w, h);
}

function bboxFromWrite(b) {
  return normalizeBBox(b.x0, b.y0, b.w, b.h);
}

function buildProjection(geo, canvas, baseDir) {
  if (!geo) return null;
  const { w, h, inner } = canvas;
  const source = resolveGeoSource(geo.fit?.source ?? geo.source, baseDir);

  if (geo.fit && geo.fit.target !== undefined) {
    const t = geo.fit.target;
    let bbox = null;
    if (Array.isArray(t)) {
      bbox = t;
    } else if (typeof t === 'string') {
      bbox = GEO.getCountry(t, source).mainBBox;
    } else if (isPlainObject(t) && typeof t.country === 'string') {
      // PR 2 extension slot fallback: fit to country until PR 5 wires admin1
      bbox = GEO.getCountry(t.country, source).mainBBox;
    }
    if (bbox) {
      const m = inner + (geo.fit.margin ?? 6);
      const frame = geo.fit.frame || [m, m, w - m, h - m];
      return M.fitProjection(bbox, {
        frame,
        rotDeg: geo.fit.rotDeg ?? 0,
        zoom: geo.fit.zoom ?? 1,
      });
    }
  }

  if (geo.projection) {
    const p = geo.projection;
    return M.createProjection({
      lon0: p.lon0,
      lat0: p.lat0,
      scale: p.scale,
      cx: p.cx ?? w / 2,
      cy: p.cy ?? h / 2,
      rotDeg: p.rotDeg ?? 0,
    });
  }

  return null;
}

function collectGeoRingsPure(proj, geo, canvas, baseDir) {
  if (!proj || !geo) return [];
  const source = resolveGeoSource(geo.fit?.source ?? geo.source, baseDir);
  const stubP = { w: canvas.w, h: canvas.h };
  const rings = [];
  const focusIds = geo.focus ? [].concat(geo.focus) : [];
  const focusCountries = focusIds.map((id) => GEO.getCountry(id, source));
  const focusSet = new Set(focusCountries.map((c) => c.id));

  let neighbors = [];
  if (Array.isArray(geo.neighbors)) {
    neighbors = geo.neighbors.map((id) => GEO.getCountry(id, source));
  } else if (geo.neighbors !== false && focusCountries.length > 0) {
    neighbors = GEO.countriesInBBox(proj.extent([0, 0, canvas.w, canvas.h]), source);
  }

  for (const c of neighbors) {
    if (focusSet.has(c.id)) continue;
    rings.push(...M.geoRings(stubP, proj, c.polygons, { smooth: false }));
  }
  for (const c of focusCountries) {
    rings.push(...M.geoRings(stubP, proj, c.polygons, { smooth: false }));
  }
  return rings;
}

function labelDefaultsForKind(kind, pal) {
  if (kind === 'sea') {
    return { face: 'serif-bold', size: 3.4, align: 'center', color: '#426a80', spacing: 0.16, slant: 0.22 };
  }
  if (kind === 'region') {
    return { face: 'serif-bold', size: 2.5, align: 'center', color: '#7a6852', spacing: 0.22, slant: 0 };
  }
  return { face: 'serif-bold', size: 2.6, align: 'center', color: pal.ink, spacing: 0, slant: 0 };
}

function registerCityBoxes(layout, city, idx, pt, idPositions) {
  const id = city.id || `city-${idx + 1}`;
  idPositions.set(id, pt);
  const mr = city.capital ? 2.1 : 1.35;
  layout.register({
    id,
    kind: 'city',
    x: pt[0] - mr,
    y: pt[1] - mr,
    w: mr * 2,
    h: mr * 2,
    priority: city.priority ?? (city.capital ? 80 : 65),
    layer: 'cities',
  });
  if (city.name) {
    const dx = city.dx ?? 0;
    const dy = city.dy ?? -2.2;
    const size = city.size ?? (city.capital ? 3.2 : 2.3);
    const face = city.face ?? (city.capital ? 'serif-bold' : 'sans-bold');
    const align = city.align ?? 'center';
    const tb = estimateTextBBox(city.name, pt[0] + dx, pt[1] + dy, { face, size, align });
    layout.register({
      id: `${id}:label`,
      kind: 'label',
      ...tb,
      priority: city.priority ?? (city.capital ? 78 : 62),
      layer: 'cities',
      meta: { ownerId: id },
    });
  }
}

function planSpec(specOrPath, opts = {}) {
  const loaded = loadSpec(specOrPath);
  const validation = validateSpec(loaded, opts);
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
      spec: validation.spec,
      proj: null,
      layout: null,
      diagnostics: null,
    };
  }

  const spec = validation.spec;
  const warnings = [...validation.warnings];
  const pal = { ...M.PALETTE, ...(spec.style.palette || {}) };
  const baseDir = spec.__baseDir || null;
  const proj = buildProjection(spec.geo, spec.canvas, baseDir);
  const effectiveInner = spec.canvas.border ? spec.canvas.inner : 0;

  const layout = createLayout({
    w: spec.canvas.w,
    h: spec.canvas.h,
    inner: effectiveInner,
    gridStep: spec.layout.gridStep ?? 2.0,
    padding: spec.layout.padding ?? 1.0,
  });

  const landRings = collectGeoRingsPure(proj, spec.geo, spec.canvas, baseDir);
  if (landRings.length) layout.setLandPolygons(landRings);

  const idPositions = new Map();

  // Mountains
  if (Array.isArray(spec.layers.mountains)) {
    spec.layers.mountains.forEach((mRange, idx) => {
      const peaks = Array.isArray(mRange) ? mRange : (mRange.peaks || []);
      const pts = [];
      for (const pk of peaks) {
        if (!Array.isArray(pk) || pk.length < 4) continue;
        const [cx, by, pw, ph] = pk;
        pts.push([cx - pw, by - ph], [cx + pw, by]);
      }
      const bb = bboxFromPoints(pts);
      if (bb) {
        layout.register({
          id: (!Array.isArray(mRange) && mRange.id) || `mountains-${idx + 1}`,
          kind: 'mountain',
          ...bb,
          priority: 40,
          layer: 'terrain',
        });
      }
    });
  }

  // Rice fields
  if (Array.isArray(spec.layers.riceFields)) {
    spec.layers.riceFields.forEach((rf, idx) => {
      const pt = resolvePoint(rf, proj, idPositions);
      if (!pt) return;
      const rw = rf.w ?? 14;
      const rh = rf.h ?? 6;
      layout.register({
        id: rf.id || `rice-${idx + 1}`,
        kind: 'riceFields',
        x: pt[0] - rw / 2,
        y: pt[1] - rh / 2,
        w: rw,
        h: rh,
        priority: 30,
        layer: 'terrain',
        meta: { nonBlocking: true },
      });
    });
  }

  // Waves
  if (Array.isArray(spec.layers.waves)) {
    spec.layers.waves.forEach((wv, idx) => {
      const pt = resolvePoint(wv, proj, idPositions);
      if (!pt) return;
      const s = wv.scale ?? wv.s ?? 1;
      const count = wv.count ?? 2;
      layout.register({
        id: wv.id || `waves-${idx + 1}`,
        kind: 'wave',
        x: pt[0],
        y: pt[1] - 0.68 * s,
        w: (12 + (count - 1) * 2) * s,
        h: ((count - 1) * 2 + 1.36) * s,
        priority: 20,
        layer: 'water',
        meta: { nonBlocking: true },
      });
    });
  }

  // Cities
  if (Array.isArray(spec.layers.cities)) {
    spec.layers.cities.forEach((city, idx) => {
      const pt = resolvePoint(city, proj, idPositions);
      if (!pt) return;
      registerCityBoxes(layout, city, idx, pt, idPositions);
    });
  }

  // Elements
  spec.elements.forEach((el, idx) => {
    if (el.type === 'svg') {
      warnings.push(`elements[${idx}] (type "svg") is a PR 3 extension slot and will be rendered once SVG support is integrated.`);
      return;
    }
    const pt = resolvePoint(el, proj, idPositions);
    if (!pt) return;
    const id = el.id || `el-${el.type}-${idx + 1}`;
    idPositions.set(id, pt);
    const elOpts = isPlainObject(el.options) ? el.options : {};
    const bb = estimateElementBox(el.type, pt[0], pt[1], el.scale, {
      ...elOpts,
      angle: el.angle ?? elOpts.angle ?? 0,
    });
    layout.register({
      id,
      kind: 'element',
      ...bb,
      priority: el.priority ?? 55,
      layer: 'elements',
    });
    if (el.label) {
      const lObj = typeof el.label === 'string' ? { text: el.label } : el.label;
      const lx = lObj.x ?? (pt[0] + (lObj.dx ?? 0));
      const ly = lObj.y ?? (bb.y1 + (lObj.dy ?? 3.2));
      const defs = labelDefaultsForKind('label', pal);
      const tb = estimateTextBBox(lObj.text, lx, ly, { ...defs, ...lObj });
      layout.register({
        id: `${id}:label`,
        kind: 'label',
        ...tb,
        priority: lObj.priority ?? 52,
        layer: 'labels',
        meta: { ownerId: id },
      });
    }
  });

  // Labels
  spec.labels.forEach((lbl, idx) => {
    const pt = resolvePoint(lbl, proj, idPositions);
    if (!pt) return;
    const kind = lbl.kind || 'label';
    const defs = labelDefaultsForKind(kind, pal);
    const tb = estimateTextBBox(lbl.text, pt[0], pt[1], { ...defs, ...lbl });
    const id = lbl.id || `label-${idx + 1}`;
    idPositions.set(id, pt);
    layout.register({
      id,
      kind: kind === 'label' ? 'label' : `${kind}Label`,
      ...tb,
      priority: lbl.priority ?? 60,
      layer: 'labels',
    });
  });

  // Insets
  spec.insets.forEach((ins, idx) => {
    const id = ins.id || `inset-${idx + 1}`;
    layout.register({
      id,
      kind: 'inset',
      x: ins.x,
      y: ins.y,
      w: ins.w,
      h: ins.h,
      priority: ins.priority ?? 90,
      layer: 'chrome',
    });
  });

  // Compass
  if (spec.compass) {
    const pt = resolvePoint(spec.compass, proj, idPositions);
    if (pt) {
      const r = spec.compass.r ?? 9;
      layout.register({
        id: spec.compass.id || 'compass',
        kind: 'compass',
        x: pt[0] - 1.65 * r,
        y: pt[1] - 1.65 * r,
        w: 3.3 * r,
        h: 3.3 * r,
        priority: spec.compass.priority ?? 85,
        layer: 'chrome',
      });
    }
  }

  // Cartouche
  if (spec.cartouche && isFiniteNum(spec.cartouche.x) && isFiniteNum(spec.cartouche.y)) {
    const c = spec.cartouche;
    layout.register({
      id: c.id || 'cartouche',
      kind: 'cartouche',
      x: c.x,
      y: c.y,
      w: c.w + 1.4,
      h: c.h + 1.4,
      priority: c.priority ?? 95,
      layer: 'chrome',
    });
  }

  const diagnostics = layout.toDiagnostics({ ppm: spec.canvas.ppm, warnings });
  return {
    ok: true,
    errors: [],
    warnings,
    spec,
    proj,
    layout,
    diagnostics,
  };
}

function drawElementItem(map, el, pt, pal) {
  const rawOpts = isPlainObject(el.options) ? { ...el.options } : {};
  // Resolve named palette color tokens in options
  for (const colorKey of ['color', 'wall', 'roof', 'sail', 'sail2', 'bowlColor', 'soupColor', 'hatColor', 'capColor', 'blushColor', 'apron']) {
    if (typeof rawOpts[colorKey] === 'string') {
      rawOpts[colorKey] = resolveColor(rawOpts[colorKey], pal);
    }
  }

  if (el.type === 'person') {
    const scale = el.scale ?? 0.52;
    map.person(pt[0], pt[1], scale, rawOpts);
    return;
  }

  const fn = map.el[el.type];
  if (el.type === 'shinkansen') {
    const angle = el.angle ?? rawOpts.angle ?? 0;
    fn(pt[0], pt[1], el.scale ?? 1, angle, rawOpts);
    return;
  }
  if (el.type === 'koi') {
    const angle = el.angle ?? rawOpts.angle ?? 0;
    fn(pt[0], pt[1], el.scale ?? 1, angle);
    return;
  }
  if (el.type === 'hanbok') {
    fn(pt[0], pt[1], el.scale ?? 0.52, rawOpts);
    return;
  }
  if (el.scale !== undefined || Object.keys(rawOpts).length > 0) {
    fn(pt[0], pt[1], el.scale ?? 1, rawOpts);
  } else {
    fn(pt[0], pt[1]);
  }
}

function renderSpec(specOrPath, opts = {}) {
  const { createMap } = require('./index');
  const loaded = loadSpec(specOrPath);
  const validation = validateSpec(loaded, opts);
  if (!validation.ok) {
    throw new Error(`Invalid map spec:\n- ${validation.errors.join('\n- ')}`);
  }

  const spec = validation.spec;
  const warnings = [...validation.warnings];
  const pal = { ...M.PALETTE, ...(spec.style.palette || {}) };
  const baseDir = spec.__baseDir || null;

  const seed = opts.seed ?? spec.meta.seed ?? 'map-1';
  const effectiveBorder = spec.canvas.border !== false;
  const effectivePad = effectiveBorder ? spec.canvas.pad : 0;
  const effectiveInner = effectiveBorder ? spec.canvas.inner : 0;
  const oceanOpt = spec.canvas.ocean === false
    ? false
    : (typeof spec.canvas.ocean === 'string' ? resolveColor(spec.canvas.ocean, pal) : pal.ocean);

  // 1. Paper / ocean
  const map = createMap({
    id: spec.meta.id || 'map',
    w: spec.canvas.w,
    h: spec.canvas.h,
    ppm: spec.canvas.ppm,
    pad: effectivePad,
    inner: effectiveInner,
    seed,
    paper: spec.canvas.paper,
    ocean: oceanOpt,
    border: effectiveBorder,
  });

  const proj = buildProjection(spec.geo, { ...spec.canvas, inner: effectiveInner }, baseDir);

  const layout = createLayout({
    w: spec.canvas.w,
    h: spec.canvas.h,
    inner: effectiveInner,
    gridStep: spec.layout.gridStep ?? 2.0,
    padding: spec.layout.padding ?? 1.0,
  });

  const idPositions = new Map();

  // 2. Graticule
  if (spec.layers.graticule && proj) {
    const gratOpts = isPlainObject(spec.layers.graticule) ? spec.layers.graticule : {};
    map.graticule(proj, gratOpts);
  }

  // 3 & 4. Waterlines + Neighboring land + Focus land
  const allLandRings = [];
  if (spec.geo && proj) {
    const geoSource = resolveGeoSource(spec.geo.fit?.source ?? spec.geo.source, baseDir);
    if (spec.geo.focus || Array.isArray(spec.geo.neighbors)) {
      const focusColor = Array.isArray(spec.geo.color)
        ? spec.geo.color.map((c) => resolveColor(c, pal))
        : resolveColor(spec.geo.color || pal.land, pal);
      const neighborColor = resolveColor(spec.geo.neighborColor || pal.neighborLand, pal);
      const wlOpt = spec.geo.waterlines === false
        ? false
        : (isPlainObject(spec.geo.waterlines)
          ? { ...spec.geo.waterlines, shallowColor: resolveColor(spec.geo.waterlines.shallowColor || pal.oceanShallow, pal) }
          : { shallowColor: pal.oceanShallow });

      const drawn = map.countries(proj, {
        focus: spec.geo.focus || [],
        neighbors: spec.geo.neighbors,
        color: focusColor,
        neighborColor,
        waterlines: wlOpt,
        source: geoSource,
      });
      for (const n of drawn.neighbors) allLandRings.push(...n.rings);
      for (const f of drawn.focus) allLandRings.push(...f.rings);
    }
  }

  // Optional custom land polygons in spec.geo.land
  if (spec.geo && Array.isArray(spec.geo.land) && spec.geo.land.length > 0) {
    const validLand = spec.geo.land
      .map((entry) => ({ entry, pts: resolvePathPoints(entry, proj) }))
      .filter((item) => item.pts.length >= 3);
    const customRings = validLand.map((item) => item.pts);
    if (spec.geo.waterlines !== false && customRings.length) {
      map.coastWaterlines(customRings, isPlainObject(spec.geo.waterlines) ? spec.geo.waterlines : { shallowColor: pal.oceanShallow });
    }
    validLand.forEach(({ entry, pts }) => {
      const color = resolveColor((!Array.isArray(entry) && entry.color) || pal.land, pal);
      const poly = map.land(pts, { color });
      allLandRings.push(poly);
    });
  }

  if (allLandRings.length) {
    layout.setLandPolygons(allLandRings);
  }

  // 5. Lakes, rivers, mountains, riceFields
  if (Array.isArray(spec.layers.lakes)) {
    spec.layers.lakes.forEach((lk) => {
      const pts = resolvePathPoints(lk, proj);
      if (pts.length < 3) return;
      const color = resolveColor((!Array.isArray(lk) && lk.color) || pal.ocean, pal);
      map.part(pts, color, { pressure: 0.5, passes: 2, nib: 0.22, outlineColor: pal.waterline });
    });
  }

  if (Array.isArray(spec.layers.rivers)) {
    spec.layers.rivers.forEach((rv) => {
      const pts = resolvePathPoints(rv, proj);
      if (pts.length < 2) return;
      const rvOpts = isPlainObject(rv) ? { ...rv } : {};
      if (rvOpts.color) rvOpts.color = resolveColor(rvOpts.color, pal);
      else rvOpts.color = pal.river;
      map.river(pts, rvOpts);
    });
  }

  if (Array.isArray(spec.layers.mountains)) {
    spec.layers.mountains.forEach((mRange, idx) => {
      const peaks = Array.isArray(mRange) ? mRange : (mRange.peaks || []);
      const mOpts = isPlainObject(mRange) ? { ...mRange } : {};
      if (mOpts.color) mOpts.color = resolveColor(mOpts.color, pal);
      map.mountainRange(peaks, mOpts);
      const pts = [];
      for (const pk of peaks) {
        if (!Array.isArray(pk) || pk.length < 4) continue;
        const [cx, by, pw, ph] = pk;
        pts.push([cx - pw, by - ph], [cx + pw, by]);
      }
      const bb = bboxFromPoints(pts);
      if (bb) {
        layout.register({
          id: (!Array.isArray(mRange) && mRange.id) || `mountains-${idx + 1}`,
          kind: 'mountain',
          ...bb,
          priority: 40,
          layer: 'terrain',
        });
      }
    });
  }

  if (Array.isArray(spec.layers.riceFields)) {
    spec.layers.riceFields.forEach((rf, idx) => {
      const pt = resolvePoint(rf, proj, idPositions);
      if (!pt) return;
      const rw = rf.w ?? 14;
      const rh = rf.h ?? 6;
      map.riceFields(pt[0], pt[1], rw, rh);
      layout.register({
        id: rf.id || `rice-${idx + 1}`,
        kind: 'riceFields',
        x: pt[0] - rw / 2,
        y: pt[1] - rh / 2,
        w: rw,
        h: rh,
        priority: 30,
        layer: 'terrain',
        meta: { nonBlocking: true },
      });
    });
  }

  // 6. Routes, waves, sea & region labels
  if (Array.isArray(spec.layers.routes)) {
    spec.layers.routes.forEach((rt) => {
      const pts = resolvePathPoints(rt, proj);
      if (pts.length < 2) return;
      const rtOpts = isPlainObject(rt) ? { ...rt } : {};
      if (rtOpts.color) rtOpts.color = resolveColor(rtOpts.color, pal);
      map.route(pts, rtOpts);
    });
  }

  if (Array.isArray(spec.layers.waves)) {
    spec.layers.waves.forEach((wv, idx) => {
      const pt = resolvePoint(wv, proj, idPositions);
      if (!pt) return;
      const s = wv.scale ?? wv.s ?? 1;
      const count = wv.count ?? 2;
      map.waves(pt[0], pt[1], s, count);
      layout.register({
        id: wv.id || `waves-${idx + 1}`,
        kind: 'wave',
        x: pt[0],
        y: pt[1] - 0.68 * s,
        w: (12 + (count - 1) * 2) * s,
        h: ((count - 1) * 2 + 1.36) * s,
        priority: 20,
        layer: 'water',
        meta: { nonBlocking: true },
      });
    });
  }

  const bgLabels = [];
  const fgLabels = [];
  spec.labels.forEach((lbl, idx) => {
    if (lbl.kind === 'sea' || lbl.kind === 'region') bgLabels.push([lbl, idx]);
    else fgLabels.push([lbl, idx]);
  });

  const drawSpecLabel = (lbl, idx) => {
    const pt = resolvePoint(lbl, proj, idPositions);
    if (!pt) return;
    const kind = lbl.kind || 'label';
    const lOpts = {};
    if (lbl.face) lOpts.face = lbl.face;
    if (lbl.size !== undefined) lOpts.size = lbl.size;
    if (lbl.align) lOpts.align = lbl.align;
    if (lbl.color) lOpts.color = resolveColor(lbl.color, pal);
    if (lbl.spacing !== undefined) lOpts.spacing = lbl.spacing;
    if (lbl.slant !== undefined) lOpts.slant = lbl.slant;

    let written;
    if (kind === 'sea') written = map.seaLabel(lbl.text, pt[0], pt[1], lOpts);
    else if (kind === 'region') written = map.regionLabel(lbl.text, pt[0], pt[1], lOpts);
    else written = map.label(lbl.text, pt[0], pt[1], lOpts);

    const id = lbl.id || `label-${idx + 1}`;
    idPositions.set(id, pt);
    if (written) {
      layout.register({
        id,
        kind: kind === 'label' ? 'label' : `${kind}Label`,
        ...bboxFromWrite(written),
        priority: lbl.priority ?? 60,
        layer: 'labels',
      });
    }
  };

  for (const [lbl, idx] of bgLabels) drawSpecLabel(lbl, idx);

  // 7. Cities, elements, callouts, foreground labels
  if (Array.isArray(spec.layers.cities)) {
    spec.layers.cities.forEach((city, idx) => {
      const pt = resolvePoint(city, proj, idPositions);
      if (!pt) return;
      const cOpts = {
        capital: Boolean(city.capital),
        dx: city.dx,
        dy: city.dy,
        size: city.size,
        align: city.align,
      };
      map.city(pt[0], pt[1], city.name, cOpts);
      registerCityBoxes(layout, city, idx, pt, idPositions);
    });
  }

  spec.elements.forEach((el, idx) => {
    if (el.type === 'svg') {
      warnings.push(`Skipped elements[${idx}] (type "svg"): SVG rendering is wired in PR 5.`);
      return;
    }
    const pt = resolvePoint(el, proj, idPositions);
    if (!pt) return;
    const id = el.id || `el-${el.type}-${idx + 1}`;
    idPositions.set(id, pt);

    drawElementItem(map, el, pt, pal);

    const elOpts = isPlainObject(el.options) ? el.options : {};
    const bb = estimateElementBox(el.type, pt[0], pt[1], el.scale, {
      ...elOpts,
      angle: el.angle ?? elOpts.angle ?? 0,
    });
    layout.register({
      id,
      kind: 'element',
      ...bb,
      priority: el.priority ?? 55,
      layer: 'elements',
    });

    if (el.label) {
      const lObj = typeof el.label === 'string' ? { text: el.label } : el.label;
      const lx = lObj.x ?? (pt[0] + (lObj.dx ?? 0));
      const ly = lObj.y ?? (bb.y1 + (lObj.dy ?? 3.2));
      const lOpts = {};
      if (lObj.face) lOpts.face = lObj.face;
      if (lObj.size !== undefined) lOpts.size = lObj.size;
      if (lObj.align) lOpts.align = lObj.align;
      if (lObj.color) lOpts.color = resolveColor(lObj.color, pal);
      const written = map.label(lObj.text, lx, ly, lOpts);
      if (written) {
        layout.register({
          id: `${id}:label`,
          kind: 'label',
          ...bboxFromWrite(written),
          priority: lObj.priority ?? 52,
          layer: 'labels',
          meta: { ownerId: id },
        });
      }
    }
  });

  spec.callouts.forEach((co) => {
    const fromPt = resolvePoint(co.from, proj, idPositions);
    const toPt = resolvePoint(co.to, proj, idPositions);
    if (!fromPt || !toPt) return;
    const coOpts = {};
    if (co.bendX !== undefined) coOpts.bendX = co.bendX;
    if (co.bendY !== undefined) coOpts.bendY = co.bendY;
    if (co.color) coOpts.color = resolveColor(co.color, pal);
    map.callout(fromPt, toPt, coOpts);
  });

  for (const [lbl, idx] of fgLabels) drawSpecLabel(lbl, idx);

  // 8. Insets, compass, cartouche
  spec.insets.forEach((ins, idx) => {
    const id = ins.id || `inset-${idx + 1}`;
    map.insetBox(ins.x, ins.y, ins.w, ins.h, ins.title);
    layout.register({
      id,
      kind: 'inset',
      x: ins.x,
      y: ins.y,
      w: ins.w,
      h: ins.h,
      priority: ins.priority ?? 90,
      layer: 'chrome',
    });

    if (ins.geo) {
      const subPadTop = ins.title ? 9 : 3;
      const subFrame = [ins.x + 3, ins.y + subPadTop, ins.x + ins.w - 3, ins.y + ins.h - 3];
      const clipFrame = [ins.x + 1.2, ins.y + 1.2, ins.x + ins.w - 1.2, ins.y + ins.h - 1.2];
      const subGeo = isPlainObject(ins.geo) ? { ...ins.geo } : {};
      if (subGeo.fit) {
        subGeo.fit = { ...subGeo.fit, frame: subGeo.fit.frame || subFrame };
      }
      const subProj = buildProjection(subGeo, spec.canvas, baseDir);
      if (subProj && subGeo.focus) {
        const subSource = resolveGeoSource(subGeo.fit?.source ?? subGeo.source, baseDir);
        map.countries(subProj, {
          focus: subGeo.focus,
          neighbors: subGeo.neighbors ?? false,
          color: resolveColor(subGeo.color || pal.land, pal),
          neighborColor: resolveColor(subGeo.neighborColor || pal.neighborLand, pal),
          waterlines: subGeo.waterlines === false ? false : { r1: 1.1, r2: 2.2, shallowColor: pal.oceanShallow },
          frame: clipFrame,
          source: subSource,
        });
      }
    }
  });

  if (spec.compass) {
    const pt = resolvePoint(spec.compass, proj, idPositions);
    if (pt) {
      const r = spec.compass.r ?? 9;
      let angle = 0;
      if (spec.compass.angle === 'auto' || spec.compass.angle === undefined) {
        if (proj) {
          const [lon, lat] = proj.inverse(pt[0], pt[1]);
          angle = proj.northAngle(lon, lat);
        }
      } else if (isFiniteNum(spec.compass.angle)) {
        angle = spec.compass.angle;
      }
      map.compass(pt[0], pt[1], r, {
        angle,
        rhumb: spec.compass.rhumb !== false,
      });
      layout.register({
        id: spec.compass.id || 'compass',
        kind: 'compass',
        x: pt[0] - 1.65 * r,
        y: pt[1] - 1.65 * r,
        w: 3.3 * r,
        h: 3.3 * r,
        priority: spec.compass.priority ?? 85,
        layer: 'chrome',
      });
    }
  }

  if (spec.cartouche && isFiniteNum(spec.cartouche.x) && isFiniteNum(spec.cartouche.y)) {
    const c = spec.cartouche;
    const info = {
      ...c,
      country: c.country ?? c.title,
      facts: normalizeCartoucheFacts(c.facts),
      mmPerKm: c.mmPerKm ?? (proj ? proj.mmPerKm : undefined),
    };
    map.cartouche(c.x, c.y, c.w, c.h, info);
    layout.register({
      id: c.id || 'cartouche',
      kind: 'cartouche',
      x: c.x,
      y: c.y,
      w: c.w + 1.4,
      h: c.h + 1.4,
      priority: c.priority ?? 95,
      layer: 'chrome',
    });
  }

  const diagnostics = layout.toDiagnostics({ ppm: spec.canvas.ppm, warnings });

  return {
    map,
    proj,
    layout,
    diagnostics,
    save: (outPath, saveOpts) => map.save(outPath, saveOpts),
  };
}

module.exports = {
  loadSpec,
  validateSpec,
  planSpec,
  renderSpec,
};
