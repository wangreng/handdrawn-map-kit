'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const Lt = require('../engine/lib/letter');
const { PAPERS } = require('../engine/kit/paper');
const { POSES } = require('../engine/lib/people');
const M = require('./mapPrimitives');
const EL = require('./elements');
const SVG = require('./svgDraw');
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

function normalizeSvgInput(svg) {
  if (Array.isArray(svg)) return { paths: svg };
  return svg;
}

function registerSpecFonts(spec, baseDir) {
  if (!spec || !isPlainObject(spec.style)) return;
  const { font, fonts } = spec.style;

  if (Array.isArray(fonts)) {
    for (const f of fonts) {
      if (isPlainObject(f) && typeof f.name === 'string' && typeof f.path === 'string') {
        Lt.registerFont(f.name, resolveGeoSource(f.path, baseDir), f);
      }
    }
  } else if (isPlainObject(fonts)) {
    for (const [name, val] of Object.entries(fonts)) {
      if (typeof val === 'string') {
        Lt.registerFont(name, resolveGeoSource(val, baseDir));
      } else if (isPlainObject(val) && typeof val.path === 'string') {
        Lt.registerFont(name, resolveGeoSource(val.path, baseDir), val);
      }
    }
  }

  if (isPlainObject(font) && typeof font.path === 'string') {
    Lt.registerFont(font.name || 'custom', resolveGeoSource(font.path, baseDir), font);
  }
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

  // schemaVersion (required: must be 1)
  if (spec.schemaVersion === undefined || spec.schemaVersion === null) {
    errors.push('Missing required "schemaVersion" (expected 1).');
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
  if (isPlainObject(spec.style.font) && typeof spec.style.font.path === 'string') {
    const fp = path.resolve(resolveGeoSource(spec.style.font.path, baseDir));
    if (!fs.existsSync(fp)) {
      errors.push(`style.font file not found: "${spec.style.font.path}".`);
    }
  }
  if (Array.isArray(spec.style.fonts)) {
    spec.style.fonts.forEach((f, idx) => {
      if (isPlainObject(f) && typeof f.path === 'string') {
        const fp = path.resolve(resolveGeoSource(f.path, baseDir));
        if (!fs.existsSync(fp)) {
          errors.push(`style.fonts[${idx}] file not found: "${f.path}".`);
        }
      }
    });
  } else if (isPlainObject(spec.style.fonts)) {
    for (const [name, val] of Object.entries(spec.style.fonts)) {
      const rawPath = typeof val === 'string'
        ? val
        : (isPlainObject(val) && typeof val.path === 'string' ? val.path : null);
      if (rawPath) {
        const fp = path.resolve(resolveGeoSource(rawPath, baseDir));
        if (!fs.existsSync(fp)) {
          errors.push(`style.fonts.${name} file not found: "${rawPath}".`);
        }
      }
    }
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
            if (t.length !== 4 || !t.every(isFiniteNum) || t[0] === t[2] || t[1] >= t[3]) {
              errors.push('geo.fit.target bbox must be [west, south, east, north] with west !== east and south < north.');
            }
          } else if (typeof t === 'string' || isPlainObject(t)) {
            try {
              GEO.resolveRegion(t, { countrySource: geoSource });
            } catch (err) {
              errors.push(`Invalid geo.fit.target: ${err.message}`);
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
      if (spec.geo.admin1 !== undefined && typeof spec.geo.admin1 !== 'boolean') {
        if (!isPlainObject(spec.geo.admin1)) {
          errors.push('geo.admin1 must be a boolean or configuration object.');
        } else {
          const a1 = spec.geo.admin1;
          const a1Source = resolveGeoSource(a1.source, baseDir);
          let a1Country = a1.country;
          let a1CountryValid = true;
          if (a1Country !== undefined && typeof a1Country === 'string') {
            const foundCountry = GEO.findCountry(a1Country, geoSource);
            if (!foundCountry) {
              errors.push(`Unknown country "${a1Country}" in geo.admin1.country.`);
              a1CountryValid = false;
            } else {
              a1Country = foundCountry.id;
            }
          } else if (a1Country === undefined) {
            const t = spec.geo.fit?.target;
            if (isPlainObject(t) && typeof t.country === 'string') {
              a1Country = GEO.findCountry(t.country, geoSource)?.id ?? t.country;
            } else if (typeof t === 'string') {
              const foundCountry = GEO.findCountry(t, geoSource);
              if (foundCountry) a1Country = foundCountry.id;
            }
          }
          if (a1CountryValid) {
            for (const field of ['focus', 'highlight', 'neighbors']) {
              const rawVal = a1[field];
              if (rawVal === undefined || typeof rawVal === 'boolean') continue;
              const list = Array.isArray(rawVal) ? rawVal : [rawVal];
              for (const id of list) {
                if (typeof id !== 'string') {
                  errors.push(`geo.admin1.${field} entries must be admin-1 code/name strings.`);
                } else if (!GEO.findAdmin1(id, { country: a1Country, source: a1Source })) {
                  errors.push(`Unknown admin-1 region "${id}" in geo.admin1.${field}.`);
                }
              }
            }
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
          const validSvg = typeof el.svg === 'string'
            ? el.svg.length > 0
            : (isPlainObject(el.svg) || Array.isArray(el.svg));
          if (!validSvg) {
            errors.push(`elements[${idx}] with type "svg" requires an "svg" string, object, or path array.`);
          }
        } else if (el.type === 'person') {
          if (el.options && typeof el.options.pose === 'string' && !Object.hasOwn(POSES, el.options.pose)) {
            warnings.push(`elements[${idx}] references unknown person pose "${el.options.pose}"; falling back to "stand".`);
          }
        } else if (!Object.hasOwn(EL.ELEMENT_BOUNDS, el.type) || typeof EL[el.type] !== 'function') {
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
        const hasPlace = typeof lbl.place === 'string' && lbl.place.length > 0;
        const hasPath = Array.isArray(lbl.path) && lbl.path.length >= 2;
        const isAuto = lbl.placement === 'auto';
        if (!hasXY && !hasGeo && !hasPlace && !hasPath && !isAuto) {
          errors.push(`labels[${idx}] ("${lbl.text || ''}") must specify (x, y), (lon, lat), place, path, or placement: "auto".`);
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
  if (opts.autoLayout) {
    spec.layout.autoPlace = true;
    spec.layout.avoidOverlap = true;
  }
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

function getGeoContext(spec) {
  const ctx = {};
  const t = spec.geo && spec.geo.fit && spec.geo.fit.target;
  if (typeof t === 'string') {
    if (GEO.findCountry(t)) ctx.country = t;
  } else if (isPlainObject(t)) {
    if (typeof t.country === 'string') ctx.country = t.country;
    if (typeof t.admin1 === 'string') ctx.admin1 = t.admin1;
  }
  if (!ctx.country && spec.geo && isPlainObject(spec.geo.admin1) && typeof spec.geo.admin1.country === 'string') {
    ctx.country = spec.geo.admin1.country;
  }
  return ctx;
}

function resolvePoint(item, proj, idPositions, geoContext, warnings) {
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
  if (typeof item.place === 'string' && item.place.length > 0 && proj) {
    const country = item.country || (geoContext && geoContext.country);
    const admin1 = item.admin1 || (geoContext && geoContext.admin1);
    let place = GEO.findPlace(item.place, { country, admin1 });
    if (!place && !item.admin1 && country) {
      place = GEO.findPlace(item.place, { country });
    }
    if (!place && !item.country && !item.admin1) {
      place = GEO.findPlace(item.place);
    }
    if (place) {
      const [px, py] = proj(place.lon, place.lat);
      return [px + dx, py + dy];
    }
    if (Array.isArray(warnings)) {
      warnings.push(`Unknown place "${item.place}" could not be resolved and was skipped.`);
    }
  }
  if (isFiniteNum(item.x) && isFiniteNum(item.y)) {
    return [item.x + dx, item.y + dy];
  }
  if (isFiniteNum(item.cx) && isFiniteNum(item.cy)) {
    return [item.cx + dx, item.cy + dy];
  }
  return null;
}

function resolvePathPoints(entry, proj, defaultGeo = false) {
  const rawPts = Array.isArray(entry) ? entry : (entry.pts || entry.points || entry.geoPts || []);
  const explicitCoords = !Array.isArray(entry) ? entry.coords : undefined;
  let isGeo = explicitCoords === 'geo' || (!Array.isArray(entry) && Boolean(entry.geoPts));
  if (!isGeo && explicitCoords === undefined && defaultGeo && proj && rawPts.length > 0) {
    const allNumPairs = rawPts.every((p) => Array.isArray(p) && p.length >= 2 && isFiniteNum(p[0]) && isFiniteNum(p[1]));
    if (allNumPairs && rawPts.every((p) => Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) {
      isGeo = true;
    }
  }
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
  const mb = Lt.measureBox(text, {
    x,
    y,
    face: o.face || 'serif-bold',
    size: o.size || 2.6,
    spacing: o.spacing || 0,
    slant: o.slant || 0,
    align: o.align || 'left',
    angle: o.angle,
    rotateDeg: o.rotateDeg,
    sub: o.sub ?? o.subtext,
    bilingualLayout: o.bilingualLayout,
    layout: o.layout,
    secondarySize: o.secondarySize ?? o.subSize,
    secondaryFace: o.secondaryFace ?? o.subFace,
    gap: o.gap,
    sep: o.sep,
  });
  return normalizeBBox(mb.x0, mb.y0, mb.w, mb.h);
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
    const resolved = GEO.resolveRegion(t, { countrySource: source });
    const bbox = geo.fit.fullBBox ? resolved.bbox : resolved.mainBBox;
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

function normalizeAdmin1Opts(geo, pal, baseDir, hasCountryFocus) {
  if (!geo || !geo.admin1) return null;
  const raw = geo.admin1 === true ? {} : { ...geo.admin1 };
  const targetCountry = isPlainObject(geo.fit?.target) && typeof geo.fit.target.country === 'string'
    ? geo.fit.target.country
    : (typeof geo.fit?.target === 'string' && GEO.findCountry(geo.fit.target) ? geo.fit.target : undefined);
  const country = raw.country ?? targetCountry;
  const focus = raw.focus ?? raw.highlight ?? [];
  const focusArr = Array.isArray(focus) ? focus : (focus ? [focus] : []);
  const source = resolveGeoSource(raw.source, baseDir);

  const opts = {
    country,
    focus: focusArr,
    neighbors: raw.neighbors,
    source,
    bbox: raw.bbox,
    bordersOnly: raw.bordersOnly ?? (focusArr.length === 0 && !raw.fill),
    fill: typeof raw.fill === 'string' ? resolveColor(raw.fill, pal) : raw.fill,
    color: Array.isArray(raw.color)
      ? raw.color.map((c) => resolveColor(c, pal))
      : resolveColor(raw.color || geo.color || pal.land, pal),
    neighborColor: resolveColor(raw.neighborColor || geo.neighborColor || pal.neighborLand, pal),
    borderColor: resolveColor(raw.borderColor || '#7d7365', pal),
    outlineColor: raw.outlineColor ? resolveColor(raw.outlineColor, pal) : undefined,
    borderNib: raw.borderNib,
    neighborNib: raw.neighborNib,
    nib: raw.nib,
  };

  if (raw.waterlines !== undefined) {
    opts.waterlines = isPlainObject(raw.waterlines)
      ? { ...raw.waterlines, shallowColor: resolveColor(raw.waterlines.shallowColor || pal.oceanShallow, pal) }
      : raw.waterlines;
  } else if (!hasCountryFocus && !opts.bordersOnly && geo.waterlines !== false) {
    opts.waterlines = isPlainObject(geo.waterlines)
      ? { ...geo.waterlines, shallowColor: resolveColor(geo.waterlines.shallowColor || pal.oceanShallow, pal) }
      : { shallowColor: pal.oceanShallow };
  }

  return opts;
}

function collectGeoRingsPure(proj, geo, canvas, baseDir, pal) {
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

  if (geo.admin1) {
    const a1Opts = normalizeAdmin1Opts(geo, pal || M.PALETTE, baseDir, focusCountries.length > 0);
    if (a1Opts) {
      const a1Focus = a1Opts.focus.map((id) => GEO.getAdmin1(id, { country: a1Opts.country, source: a1Opts.source }));
      const a1Set = new Set(a1Focus.map((r) => r.id));
      let a1Neighbors = [];
      if (Array.isArray(a1Opts.neighbors)) {
        a1Neighbors = a1Opts.neighbors.map((id) => GEO.getAdmin1(id, { country: a1Opts.country, source: a1Opts.source }));
      } else if (a1Opts.neighbors !== false) {
        a1Neighbors = GEO.admin1InBBox(a1Opts.bbox || proj.extent([0, 0, canvas.w, canvas.h]), {
          country: a1Opts.country,
          source: a1Opts.source,
        });
      }
      for (const r of a1Neighbors) {
        if (a1Set.has(r.id)) continue;
        rings.push(...M.geoRings(stubP, proj, r.polygons, { smooth: false }));
      }
      for (const r of a1Focus) {
        rings.push(...M.geoRings(stubP, proj, r.polygons, { smooth: false }));
      }
    }
  }

  if (Array.isArray(geo.land)) {
    for (const entry of geo.land) {
      const pts = resolvePathPoints(entry, proj);
      if (pts.length >= 3) rings.push(pts);
    }
  }

  return rings;
}

function labelDefaultsForKind(kind, pal, defaultFace) {
  const baseFace = defaultFace || 'serif-bold';
  if (kind === 'sea') {
    return { face: baseFace, size: 3.4, align: 'center', color: '#426a80', spacing: 0.16, slant: 0.22 };
  }
  if (kind === 'region') {
    return { face: baseFace, size: 2.5, align: 'center', color: '#7a6852', spacing: 0.22, slant: 0 };
  }
  return { face: baseFace, size: 2.6, align: 'center', color: pal.ink, spacing: 0, slant: 0 };
}

function buildSvgOpts(el, pal) {
  const raw = isPlainObject(el.options) ? { ...el.options } : {};
  const out = { ...raw, palette: pal };
  if (out.w === undefined && out.width !== undefined) out.w = out.width;
  if (out.h === undefined && out.height !== undefined) out.h = out.height;
  if (out.w === undefined && el.w !== undefined) out.w = el.w;
  if (out.w === undefined && el.width !== undefined) out.w = el.width;
  if (out.h === undefined && el.h !== undefined) out.h = el.h;
  if (out.h === undefined && el.height !== undefined) out.h = el.height;
  if (out.scale === undefined && el.scale !== undefined) out.scale = el.scale;
  if (out.anchor === undefined && el.anchor !== undefined) out.anchor = el.anchor;
  if (out.fillStyle === undefined && el.fillStyle !== undefined) out.fillStyle = el.fillStyle;
  if (out.rot === undefined && el.angle !== undefined) out.rot = el.angle;
  if (out.rotDeg === undefined && el.rotateDeg !== undefined) out.rotDeg = el.rotateDeg;
  if (typeof out.defaultStroke === 'string') out.defaultStroke = resolveColor(out.defaultStroke, pal);
  return out;
}

function resolveAutoCities(cfg, proj, canvas, effectiveInner, metaLang, geoContext) {
  if (!proj) return [];
  const limit = cfg.limit ?? cfg.max ?? 12;
  const country = cfg.country ?? (geoContext && geoContext.country);
  const admin1 = cfg.admin1;
  const places = cfg.names
    ? [].concat(cfg.names).map((n) => GEO.findPlace(n, { country, admin1, source: cfg.source })).filter(Boolean)
    : GEO.placesInBBox(cfg.bbox || proj.extent([0, 0, canvas.w, canvas.h]), {
      country,
      admin1,
      maxRank: cfg.maxRank,
      minPop: cfg.minPop,
      capitalsOnly: cfg.capitalsOnly,
      limit,
      source: cfg.source,
    });

  const frame = cfg.frame || [effectiveInner + 2, effectiveInner + 2, canvas.w - effectiveInner - 2, canvas.h - effectiveInner - 2];
  const minSpacing = cfg.minSpacing ?? 0;
  const lang = cfg.labelLang || metaLang;
  const bilingual = Boolean(cfg.bilingual);

  const out = [];
  for (const place of places) {
    const [x, y] = proj(place.lon, place.lat);
    if (x < frame[0] || x > frame[2] || y < frame[1] || y > frame[3]) continue;
    if (minSpacing > 0 && !place.capital && out.some((c) => Math.hypot(c.pt[0] - x, c.pt[1] - y) < minSpacing)) continue;

    let primary = place.name;
    let subtext;
    if (cfg.labels === false) {
      primary = '';
    } else if (lang === 'zh' && place.zh) {
      primary = place.zh;
      if (bilingual && place.name && place.name !== primary) subtext = place.name;
    } else if (lang === 'ja' && place.ja) {
      primary = place.ja;
      if (bilingual && place.name && place.name !== primary) subtext = place.name;
    } else if (lang === 'ko' && place.ko) {
      primary = place.ko;
      if (bilingual && place.name && place.name !== primary) subtext = place.name;
    } else if (bilingual) {
      const local = place.zh || place.ja || place.ko;
      if (local && local !== place.name) {
        primary = local;
        subtext = place.name;
      }
    }

    const baseOpts = isPlainObject(cfg.cityOpts) ? cfg.cityOpts : {};
    out.push({
      id: `auto-city-${out.length + 1}`,
      name: primary,
      subtext,
      capital: Boolean(place.capital || place.adm1Capital),
      pt: [x, y],
      priority: place.capital ? 78 : 58,
      ...baseOpts,
    });
  }
  return out;
}

function buildLabelDrawOpts(lbl, defs, pal) {
  const lOpts = {};
  if (lbl.face) lOpts.face = lbl.face;
  else if (defs.face) lOpts.face = defs.face;
  if (lbl.size !== undefined) lOpts.size = lbl.size;
  if (lbl.align) lOpts.align = lbl.align;
  if (lbl.color) lOpts.color = resolveColor(lbl.color, pal);
  if (lbl.spacing !== undefined) lOpts.spacing = lbl.spacing;
  if (lbl.slant !== undefined) lOpts.slant = lbl.slant;
  if (lbl.angle !== undefined) lOpts.angle = lbl.angle;
  if (lbl.rotateDeg !== undefined) lOpts.rotateDeg = lbl.rotateDeg;
  if (lbl.halo !== undefined) lOpts.halo = lbl.halo;
  if (lbl.opacity !== undefined) lOpts.opacity = lbl.opacity;
  const sub = lbl.subtext ?? lbl.sub;
  if (sub) lOpts.sub = sub;
  if (lbl.bilingualLayout) lOpts.bilingualLayout = lbl.bilingualLayout;
  if (lbl.layout) lOpts.layout = lbl.layout;
  if (lbl.secondarySize !== undefined) lOpts.secondarySize = lbl.secondarySize;
  if (lbl.subSize !== undefined) lOpts.subSize = lbl.subSize;
  if (lbl.secondaryFace) lOpts.secondaryFace = lbl.secondaryFace;
  if (lbl.subFace) lOpts.subFace = lbl.subFace;
  if (lbl.secondaryColor) lOpts.secondaryColor = resolveColor(lbl.secondaryColor, pal);
  if (lbl.subColor) lOpts.subColor = resolveColor(lbl.subColor, pal);
  if (lbl.gap !== undefined) lOpts.gap = lbl.gap;
  if (lbl.sep !== undefined) lOpts.sep = lbl.sep;
  return lOpts;
}

function buildLayoutPlan(spec, proj, pal, baseDir, opts = {}, landRingsOverride = null) {
  registerSpecFonts(spec, baseDir);
  const warnings = [];
  const effectiveInner = spec.canvas.border ? spec.canvas.inner : 0;
  const autoPlace = Boolean(opts.autoLayout || spec.layout.autoPlace);
  const avoidOverlap = Boolean(opts.autoLayout || spec.layout.avoidOverlap);
  const pad = spec.layout.padding ?? 1.0;
  const defaultFace = typeof spec.style.font === 'string'
    ? spec.style.font
    : (isPlainObject(spec.style.font) && typeof spec.style.font.path === 'string'
      ? (spec.style.font.name || 'custom')
      : undefined);
  const geoContext = getGeoContext(spec);

  const layout = createLayout({
    w: spec.canvas.w,
    h: spec.canvas.h,
    inner: effectiveInner,
    gridStep: spec.layout.gridStep ?? 2.0,
    padding: pad,
  });

  const landRings = landRingsOverride || collectGeoRingsPure(proj, spec.geo, spec.canvas, baseDir, pal);
  if (landRings.length) layout.setLandPolygons(landRings);

  const idPositions = new Map();
  const plan = {
    layout,
    idPositions,
    warnings,
    autoPlace,
    avoidOverlap,
    mountains: [],
    riceFields: [],
    waves: [],
    cities: [],
    elements: [],
    labels: [],
    insets: [],
    compass: null,
    cartouche: null,
    autoCallouts: [],
  };

  // 1. Insets (fixed chrome)
  spec.insets.forEach((ins, idx) => {
    const id = ins.id || `inset-${idx + 1}`;
    const item = layout.register({
      id,
      kind: 'inset',
      x: ins.x,
      y: ins.y,
      w: ins.w,
      h: ins.h,
      priority: ins.priority ?? 90,
      fixed: ins.fixed ?? true,
      layer: 'chrome',
    });
    plan.insets.push({ ins, id, item });
  });

  // 2. Explicit cartouche (non-auto)
  if (spec.cartouche && spec.cartouche.placement !== 'auto' && isFiniteNum(spec.cartouche.x) && isFiniteNum(spec.cartouche.y)) {
    const c = spec.cartouche;
    const id = c.id || 'cartouche';
    const item = layout.register({
      id,
      kind: 'cartouche',
      x: c.x,
      y: c.y,
      w: c.w + 1.4,
      h: c.h + 1.4,
      priority: c.priority ?? 95,
      fixed: c.fixed ?? true,
      layer: 'chrome',
    });
    plan.cartouche = { c, id, x: c.x, y: c.y, item };
  }

  // 3. Explicit compass (non-auto)
  if (spec.compass && spec.compass.placement !== 'auto') {
    const pt = resolvePoint(spec.compass, proj, idPositions, geoContext, warnings);
    if (pt) {
      const r = spec.compass.r ?? 9;
      const id = spec.compass.id || 'compass';
      const item = layout.register({
        id,
        kind: 'compass',
        x: pt[0] - 1.65 * r,
        y: pt[1] - 1.65 * r,
        w: 3.3 * r,
        h: 3.3 * r,
        priority: spec.compass.priority ?? 85,
        fixed: spec.compass.fixed ?? true,
        layer: 'chrome',
      });
      plan.compass = { cmp: spec.compass, id, pt: [...pt], r, item };
    }
  }

  // 4. Manual mountains, riceFields, waves
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
      const id = (!Array.isArray(mRange) && mRange.id) || `mountains-${idx + 1}`;
      let item = null;
      if (bb) {
        item = layout.register({
          id,
          kind: 'mountain',
          ...bb,
          priority: 40,
          fixed: true,
          layer: 'terrain',
        });
      }
      plan.mountains.push({ mRange, peaks, id, item });
    });
  }

  if (Array.isArray(spec.layers.riceFields)) {
    spec.layers.riceFields.forEach((rf, idx) => {
      const pt = resolvePoint(rf, proj, idPositions, geoContext, warnings);
      if (!pt) return;
      const rw = rf.w ?? 14;
      const rh = rf.h ?? 6;
      const id = rf.id || `rice-${idx + 1}`;
      layout.register({
        id,
        kind: 'riceFields',
        x: pt[0] - rw / 2,
        y: pt[1] - rh / 2,
        w: rw,
        h: rh,
        priority: 30,
        fixed: true,
        layer: 'terrain',
        meta: { nonBlocking: true },
      });
      plan.riceFields.push({ rf, id, pt, rw, rh });
    });
  }

  if (Array.isArray(spec.layers.waves)) {
    spec.layers.waves.forEach((wv, idx) => {
      const pt = resolvePoint(wv, proj, idPositions, geoContext, warnings);
      if (!pt) return;
      const s = wv.scale ?? wv.s ?? 1;
      const count = wv.count ?? 2;
      const id = wv.id || `waves-${idx + 1}`;
      layout.register({
        id,
        kind: 'wave',
        x: pt[0],
        y: pt[1] - 0.68 * s,
        w: (12 + (count - 1) * 2) * s,
        h: ((count - 1) * 2 + 1.36) * s,
        priority: 20,
        fixed: true,
        layer: 'water',
        meta: { nonBlocking: true },
      });
      plan.waves.push({ wv, id, pt, s, count });
    });
  }

  // 5. Cities (manual array OR { auto: true, ... })
  let cityList = [];
  if (Array.isArray(spec.layers.cities)) {
    spec.layers.cities.forEach((city, idx) => {
      const pt = resolvePoint(city, proj, idPositions, geoContext, warnings);
      if (!pt) return;
      cityList.push({ ...city, id: city.id || `city-${idx + 1}`, pt });
    });
  } else if (isPlainObject(spec.layers.cities) && (spec.layers.cities.auto || spec.layers.cities.names)) {
    cityList = resolveAutoCities(spec.layers.cities, proj, spec.canvas, effectiveInner, spec.meta.lang, geoContext);
  }

  for (const city of cityList) {
    const { id, pt } = city;
    idPositions.set(id, pt);
    const mr = city.capital ? 2.1 : 1.35;
    const dotItem = layout.register({
      id,
      kind: 'city',
      x: pt[0] - mr,
      y: pt[1] - mr,
      w: mr * 2,
      h: mr * 2,
      priority: city.priority ?? (city.capital ? 80 : 65),
      fixed: city.fixed ?? true,
      layer: 'cities',
    });

    let labelItem = null;
    const dx = city.dx ?? 0;
    const dy = city.dy ?? -2.2;
    const size = city.size ?? (city.capital ? 3.2 : 2.3);
    const face = city.face ?? (city.capital ? 'serif-bold' : 'sans-bold');
    const align = city.align ?? 'center';
    const sub = city.subtext ?? city.sub;

    if (city.name) {
      const tb = estimateTextBBox(city.name, pt[0] + dx, pt[1] + dy, {
        face,
        size,
        align,
        sub,
        bilingualLayout: city.bilingualLayout,
        layout: city.layout,
        secondarySize: city.secondarySize ?? city.subSize,
        secondaryFace: city.secondaryFace ?? city.subFace,
      });
      labelItem = layout.register({
        id: `${id}:label`,
        kind: 'label',
        ...tb,
        priority: city.priority ?? (city.capital ? 78 : 62),
        fixed: city.labelFixed !== undefined ? Boolean(city.labelFixed) : !avoidOverlap,
        layer: 'cities',
        meta: { ownerId: id },
      });
    }

    plan.cities.push({
      city,
      id,
      pt: [...pt],
      dx,
      dy,
      origLabelBox: labelItem ? { x: labelItem.x, y: labelItem.y } : null,
      dotItem,
      labelItem,
    });
  }

  // 6. Elements (explicit positions first; placement: 'auto' deferred)
  const autoElements = [];
  spec.elements.forEach((el, idx) => {
    const id = el.id || `el-${el.type}-${idx + 1}`;
    if (el.placement === 'auto') {
      autoElements.push({ el, idx, id });
      return;
    }
    const pt = resolvePoint(el, proj, idPositions, geoContext, warnings);
    if (!pt) return;
    idPositions.set(id, pt);

    let bb;
    let svgOpts = null;
    if (el.type === 'svg') {
      svgOpts = buildSvgOpts(el, pal);
      bb = SVG.measureSvg(normalizeSvgInput(el.svg), pt[0], pt[1], svgOpts);
    } else {
      const elOpts = isPlainObject(el.options) ? el.options : {};
      const elAngle = EL.ELEMENT_META[el.type]?.rotatable ? (el.angle ?? elOpts.angle ?? 0) : 0;
      bb = estimateElementBox(el.type, pt[0], pt[1], el.scale, {
        ...elOpts,
        angle: elAngle,
      });
    }

    const item = layout.register({
      id,
      kind: 'element',
      ...bb,
      priority: el.priority ?? 55,
      fixed: el.fixed !== undefined ? Boolean(el.fixed) : !avoidOverlap,
      layer: 'elements',
    });

    let labelEntry = null;
    if (el.label) {
      const lObj = typeof el.label === 'string' ? { text: el.label } : el.label;
      const lx = lObj.x ?? (pt[0] + (lObj.dx ?? 0));
      const ly = lObj.y ?? (bb.y1 + (lObj.dy ?? 3.2));
      const defs = labelDefaultsForKind('label', pal, defaultFace);
      const lOpts = buildLabelDrawOpts(lObj, defs, pal);
      const tb = estimateTextBBox(lObj.text, lx, ly, { ...defs, ...lOpts });
      const labelItem = layout.register({
        id: `${id}:label`,
        kind: 'label',
        ...tb,
        priority: lObj.priority ?? 52,
        fixed: lObj.fixed !== undefined ? Boolean(lObj.fixed) : !avoidOverlap,
        layer: 'labels',
        meta: { ownerId: id },
      });
      labelEntry = { lObj, lx, ly, lOpts, origBox: { x: labelItem.x, y: labelItem.y }, item: labelItem };
    }

    plan.elements.push({
      el,
      idx,
      id,
      pt: [...pt],
      origPt: [...pt],
      origBox: { x: item.x, y: item.y },
      svgOpts,
      item,
      labelEntry,
    });
  });

  // 7. Labels (explicit positions & paths first; placement: 'auto' deferred)
  const autoLabels = [];
  spec.labels.forEach((lbl, idx) => {
    const id = lbl.id || `label-${idx + 1}`;
    const kind = lbl.kind || 'label';
    const defs = labelDefaultsForKind(kind, pal, defaultFace);
    const lOpts = buildLabelDrawOpts(lbl, defs, pal);

    if (lbl.placement === 'auto') {
      autoLabels.push({ lbl, idx, id, kind, defs, lOpts });
      return;
    }

    if (Array.isArray(lbl.path) && lbl.path.length >= 2) {
      const pts = resolvePathPoints({ pts: lbl.path, coords: lbl.coords }, proj, false);
      if (pts.length < 2) return;
      const size = lOpts.size ?? defs.size;
      const bb = bboxFromPoints(pts, size * 0.6) || normalizeBBox(pts[0][0], pts[0][1], 0, 0);
      const mid = pts[Math.floor(pts.length / 2)];
      idPositions.set(id, mid);
      const item = layout.register({
        id,
        kind: kind === 'label' ? 'label' : `${kind}Label`,
        ...bb,
        priority: lbl.priority ?? 60,
        fixed: lbl.fixed !== undefined ? Boolean(lbl.fixed) : true,
        layer: 'labels',
      });
      plan.labels.push({ lbl, idx, id, kind, defs, lOpts, pathPts: pts, pt: mid, origBox: { x: item.x, y: item.y }, item });
      return;
    }

    const pt = resolvePoint(lbl, proj, idPositions, geoContext, warnings);
    if (!pt) return;
    idPositions.set(id, pt);
    const tb = estimateTextBBox(lbl.text, pt[0], pt[1], { ...defs, ...lOpts });
    const item = layout.register({
      id,
      kind: kind === 'label' ? 'label' : `${kind}Label`,
      ...tb,
      priority: lbl.priority ?? 60,
      fixed: lbl.fixed !== undefined ? Boolean(lbl.fixed) : !avoidOverlap,
      layer: 'labels',
    });
    plan.labels.push({ lbl, idx, id, kind, defs, lOpts, pt: [...pt], origPt: [...pt], origBox: { x: item.x, y: item.y }, item });
  });

  // 8. Auto-Placement Pass (cartouche, compass, auto elements, auto labels)
  if (spec.cartouche && (spec.cartouche.placement === 'auto' || (!plan.cartouche && autoPlace))) {
    const c = spec.cartouche;
    const id = c.id || 'cartouche';
    const bw = c.w + 1.4;
    const bh = c.h + 1.4;
    const placed = layout.placeAuto({
      w: bw,
      h: bh,
      terrain: c.terrain || 'sea',
      preferredCorners: c.preferredCorners || ['top-left', 'bottom-left', 'top-right', 'bottom-right'],
      margin: c.margin ?? 2.0,
      pad,
      fallbackAny: true,
    });
    const item = layout.register({
      id,
      kind: 'cartouche',
      x: placed.x,
      y: placed.y,
      w: bw,
      h: bh,
      priority: c.priority ?? 95,
      fixed: true,
      layer: 'chrome',
    });
    plan.cartouche = { c, id, x: placed.x, y: placed.y, item };
  }

  if (spec.compass && (spec.compass.placement === 'auto' || (!plan.compass && autoPlace))) {
    const cmp = spec.compass;
    const id = cmp.id || 'compass';
    const r = cmp.r ?? 9;
    const bw = 3.3 * r;
    const bh = 3.3 * r;
    const placed = layout.placeAuto({
      w: bw,
      h: bh,
      terrain: cmp.terrain || 'sea',
      preferredCorners: cmp.preferredCorners || ['bottom-right', 'top-right', 'bottom-left', 'top-left'],
      margin: cmp.margin ?? 2.0,
      pad,
      fallbackAny: true,
    });
    const cx = +(placed.x + bw / 2).toFixed(2);
    const cy = +(placed.y + bh / 2).toFixed(2);
    const item = layout.register({
      id,
      kind: 'compass',
      x: placed.x,
      y: placed.y,
      w: bw,
      h: bh,
      priority: cmp.priority ?? 85,
      fixed: true,
      layer: 'chrome',
    });
    plan.compass = { cmp, id, pt: [cx, cy], r, item };
  }

  for (const { el, idx, id } of autoElements) {
    let probeBb;
    let svgOpts = null;
    if (el.type === 'svg') {
      svgOpts = buildSvgOpts(el, pal);
      probeBb = SVG.measureSvg(normalizeSvgInput(el.svg), 0, 0, svgOpts);
    } else {
      const elOpts = isPlainObject(el.options) ? el.options : {};
      const elAngle = EL.ELEMENT_META[el.type]?.rotatable ? (el.angle ?? elOpts.angle ?? 0) : 0;
      probeBb = estimateElementBox(el.type, 0, 0, el.scale, { ...elOpts, angle: elAngle });
    }
    const placed = layout.placeAuto({
      w: Math.max(1, probeBb.w),
      h: Math.max(1, probeBb.h),
      terrain: el.terrain || 'any',
      margin: 2.0,
      pad,
      fallbackAny: true,
    });
    const pt = [placed.x - probeBb.x0, placed.y - probeBb.y0];
    idPositions.set(id, pt);
    const item = layout.register({
      id,
      kind: 'element',
      x: placed.x,
      y: placed.y,
      w: probeBb.w,
      h: probeBb.h,
      priority: el.priority ?? 55,
      fixed: el.fixed ?? false,
      layer: 'elements',
    });
    let labelEntry = null;
    if (el.label) {
      const lObj = typeof el.label === 'string' ? { text: el.label } : el.label;
      const lx = lObj.x ?? (pt[0] + (lObj.dx ?? 0));
      const ly = lObj.y ?? (item.y1 + (lObj.dy ?? 3.2));
      const defs = labelDefaultsForKind('label', pal, defaultFace);
      const lOpts = buildLabelDrawOpts(lObj, defs, pal);
      const tb = estimateTextBBox(lObj.text, lx, ly, { ...defs, ...lOpts });
      const labelItem = layout.register({
        id: `${id}:label`,
        kind: 'label',
        ...tb,
        priority: lObj.priority ?? 52,
        fixed: lObj.fixed !== undefined ? Boolean(lObj.fixed) : !avoidOverlap,
        layer: 'labels',
        meta: { ownerId: id },
      });
      labelEntry = { lObj, lx, ly, lOpts, origBox: { x: labelItem.x, y: labelItem.y }, item: labelItem };
    }
    plan.elements.push({
      el,
      idx,
      id,
      pt,
      origPt: [...pt],
      origBox: { x: item.x, y: item.y },
      svgOpts,
      item,
      labelEntry,
    });
  }

  for (const { lbl, idx, id, kind, defs, lOpts } of autoLabels) {
    const probeBb = estimateTextBBox(lbl.text, 0, 0, { ...defs, ...lOpts });
    const placed = layout.placeAuto({
      w: Math.max(1, probeBb.w),
      h: Math.max(1, probeBb.h),
      terrain: lbl.terrain || (kind === 'sea' ? 'sea' : 'any'),
      margin: 2.0,
      pad,
      fallbackAny: true,
    });
    const pt = [placed.x - probeBb.x0, placed.y - probeBb.y0];
    idPositions.set(id, pt);
    const item = layout.register({
      id,
      kind: kind === 'label' ? 'label' : `${kind}Label`,
      x: placed.x,
      y: placed.y,
      w: probeBb.w,
      h: probeBb.h,
      priority: lbl.priority ?? 60,
      fixed: lbl.fixed ?? false,
      layer: 'labels',
    });
    plan.labels.push({ lbl, idx, id, kind, defs, lOpts, pt, origPt: [...pt], origBox: { x: item.x, y: item.y }, item });
  }

  // 9. Collision Avoidance Pass
  if (avoidOverlap) {
    layout.avoidOverlaps({ pad, respectFixed: true });

    // Propagate deltas back to draw coordinates
    for (const iEntry of plan.insets) {
      if (iEntry.item) {
        iEntry.ins.x = iEntry.item.x;
        iEntry.ins.y = iEntry.item.y;
      }
    }

    if (plan.cartouche && plan.cartouche.item) {
      plan.cartouche.x = plan.cartouche.item.x;
      plan.cartouche.y = plan.cartouche.item.y;
    }

    if (plan.compass && plan.compass.item) {
      plan.compass.pt = [
        plan.compass.item.x + plan.compass.item.w / 2,
        plan.compass.item.y + plan.compass.item.h / 2,
      ];
    }

    for (const cEntry of plan.cities) {
      if (cEntry.labelItem && cEntry.origLabelBox) {
        const ddx = cEntry.labelItem.x - cEntry.origLabelBox.x;
        const ddy = cEntry.labelItem.y - cEntry.origLabelBox.y;
        cEntry.dx += ddx;
        cEntry.dy += ddy;
      }
    }

    for (const eEntry of plan.elements) {
      const ddx = eEntry.item.x - eEntry.origBox.x;
      const ddy = eEntry.item.y - eEntry.origBox.y;
      if (Math.hypot(ddx, ddy) > 1e-4) {
        eEntry.pt[0] += ddx;
        eEntry.pt[1] += ddy;
        idPositions.set(eEntry.id, eEntry.pt);
        if (eEntry.el.callout === 'auto' || spec.layout.autoCallout) {
          plan.autoCallouts.push(layout.routeCallout(eEntry.origPt, eEntry.item));
        }
      }
      if (eEntry.labelEntry) {
        const ldx = eEntry.labelEntry.item.x - eEntry.labelEntry.origBox.x;
        const ldy = eEntry.labelEntry.item.y - eEntry.labelEntry.origBox.y;
        eEntry.labelEntry.lx += ldx;
        eEntry.labelEntry.ly += ldy;
      }
    }

    for (const lEntry of plan.labels) {
      if (lEntry.pathPts) continue;
      const ddx = lEntry.item.x - lEntry.origBox.x;
      const ddy = lEntry.item.y - lEntry.origBox.y;
      if (Math.hypot(ddx, ddy) > 1e-4) {
        lEntry.pt[0] += ddx;
        lEntry.pt[1] += ddy;
        idPositions.set(lEntry.id, lEntry.pt);
        if (lEntry.lbl.callout === 'auto') {
          plan.autoCallouts.push(layout.routeCallout(lEntry.origPt, lEntry.item));
        }
      }
    }
  }

  return plan;
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
  const pal = { ...M.PALETTE, ...(spec.style.palette || {}) };
  const baseDir = spec.__baseDir || null;
  const effectiveInner = spec.canvas.border ? spec.canvas.inner : 0;
  const proj = buildProjection(spec.geo, { ...spec.canvas, inner: effectiveInner }, baseDir);

  const plan = buildLayoutPlan(spec, proj, pal, baseDir, opts);
  const warnings = [...validation.warnings, ...plan.warnings];
  const diagnostics = plan.layout.toDiagnostics({ ppm: spec.canvas.ppm, warnings });

  return {
    ok: true,
    errors: [],
    warnings,
    spec,
    proj,
    layout: plan.layout,
    diagnostics,
  };
}

function drawElementItem(map, el, pt, pal, svgOpts) {
  if (el.type === 'svg') {
    return map.svg(normalizeSvgInput(el.svg), pt[0], pt[1], svgOpts || buildSvgOpts(el, pal));
  }

  const rawOpts = isPlainObject(el.options) ? { ...el.options } : {};
  for (const colorKey of ['color', 'wall', 'roof', 'sail', 'sail2', 'bowlColor', 'soupColor', 'hatColor', 'capColor', 'blushColor', 'apron']) {
    if (typeof rawOpts[colorKey] === 'string') {
      rawOpts[colorKey] = resolveColor(rawOpts[colorKey], pal);
    }
  }

  if (el.type === 'person') {
    const scale = el.scale ?? 0.52;
    map.person(pt[0], pt[1], scale, rawOpts);
    return null;
  }

  const fn = map.el[el.type];
  if (el.type === 'koi') {
    const angle = el.angle ?? rawOpts.angle ?? 0;
    return fn(pt[0], pt[1], el.scale ?? 1, angle);
  }
  if (Object.hasOwn(EL.ELEMENT_META, el.type) && EL.ELEMENT_META[el.type].rotatable) {
    const angle = el.angle ?? rawOpts.angle ?? 0;
    return fn(pt[0], pt[1], el.scale ?? 1, angle, rawOpts);
  }
  if (el.type === 'hanbok') {
    return fn(pt[0], pt[1], el.scale ?? 0.52, rawOpts);
  }
  if (el.scale !== undefined || Object.keys(rawOpts).length > 0) {
    return fn(pt[0], pt[1], el.scale ?? 1, rawOpts);
  }
  return fn(pt[0], pt[1]);
}

function updateItemBox(item, bb) {
  if (!item || !bb) return;
  const norm = normalizeBBox(bb.x0 ?? bb.x, bb.y0 ?? bb.y, bb.w, bb.h);
  item.x = norm.x;
  item.y = norm.y;
  item.w = norm.w;
  item.h = norm.h;
  item.x0 = norm.x0;
  item.y0 = norm.y0;
  item.x1 = norm.x1;
  item.y1 = norm.y1;
}

function renderSpec(specOrPath, opts = {}) {
  const { createMap } = require('./index');
  const loaded = loadSpec(specOrPath);
  const validation = validateSpec(loaded, opts);
  if (!validation.ok) {
    throw new Error(`Invalid map spec:\n- ${validation.errors.join('\n- ')}`);
  }

  const spec = validation.spec;
  const pal = { ...M.PALETTE, ...(spec.style.palette || {}) };
  const baseDir = spec.__baseDir || null;
  registerSpecFonts(spec, baseDir);

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

  // 2. Graticule
  if (spec.layers.graticule && proj) {
    const gratOpts = isPlainObject(spec.layers.graticule) ? spec.layers.graticule : {};
    map.graticule(proj, gratOpts);
  }

  // 3 & 4. Waterlines + Neighboring land + Focus land + Admin-1
  const allLandRings = [];
  let hasCountryFocus = false;
  if (spec.geo && proj) {
    const geoSource = resolveGeoSource(spec.geo.fit?.source ?? spec.geo.source, baseDir);
    if (spec.geo.focus || Array.isArray(spec.geo.neighbors)) {
      hasCountryFocus = Boolean(spec.geo.focus);
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

    if (spec.geo.admin1) {
      const a1Opts = normalizeAdmin1Opts(spec.geo, pal, baseDir, hasCountryFocus);
      if (a1Opts) {
        const drawnA1 = map.admin1(proj, a1Opts);
        for (const n of drawnA1.neighbors) allLandRings.push(...n.rings);
        for (const f of drawnA1.focus) allLandRings.push(...f.rings);
      }
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

  // Build unified layout plan (including auto-placement & collision avoidance) using actual rendered land rings
  const plan = buildLayoutPlan(spec, proj, pal, baseDir, opts, allLandRings);
  const { layout, idPositions } = plan;
  const warnings = [...validation.warnings, ...plan.warnings];
  const geoContext = getGeoContext(spec);

  // 5. Lakes, rivers, mountains, riceFields
  if (Array.isArray(spec.layers.lakes)) {
    spec.layers.lakes.forEach((lk) => {
      const pts = resolvePathPoints(lk, proj);
      if (pts.length < 3) return;
      const color = resolveColor((!Array.isArray(lk) && lk.color) || pal.ocean, pal);
      map.part(pts, color, { pressure: 0.5, passes: 2, nib: 0.22, outlineColor: pal.waterline });
    });
  } else if (isPlainObject(spec.layers.lakes) && (spec.layers.lakes.auto || spec.layers.lakes.names) && proj) {
    const lkOpts = { ...spec.layers.lakes };
    if (lkOpts.color) lkOpts.color = resolveColor(lkOpts.color, pal);
    if (lkOpts.outlineColor) lkOpts.outlineColor = resolveColor(lkOpts.outlineColor, pal);
    map.geoLakes(proj, lkOpts);
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
  } else if (isPlainObject(spec.layers.rivers) && (spec.layers.rivers.auto || spec.layers.rivers.names) && proj) {
    const rvOpts = { ...spec.layers.rivers };
    if (rvOpts.color) rvOpts.color = resolveColor(rvOpts.color, pal);
    if (rvOpts.minScaleRank !== undefined && rvOpts.maxRank === undefined) rvOpts.maxRank = rvOpts.minScaleRank;
    map.geoRivers(proj, rvOpts);
  }

  if (Array.isArray(spec.layers.mountains)) {
    for (const { mRange, peaks } of plan.mountains) {
      const mOpts = isPlainObject(mRange) ? { ...mRange } : {};
      if (mOpts.color) mOpts.color = resolveColor(mOpts.color, pal);
      map.mountainRange(peaks, mOpts);
    }
  } else if (isPlainObject(spec.layers.mountains) && spec.layers.mountains.auto && proj) {
    const mOpts = { ...spec.layers.mountains };
    if (mOpts.color) mOpts.color = resolveColor(mOpts.color, pal);
    map.geoMountains(proj, mOpts);
  }

  for (const { pt, rw, rh } of plan.riceFields) {
    map.riceFields(pt[0], pt[1], rw, rh);
  }

  // 6. Routes, waves, sea & region labels
  if (Array.isArray(spec.layers.routes)) {
    spec.layers.routes.forEach((rt) => {
      const pts = resolvePathPoints(rt, proj, true);
      if (pts.length < 2) return;
      const rtOpts = isPlainObject(rt) ? { ...rt } : {};
      if (rtOpts.color) rtOpts.color = resolveColor(rtOpts.color, pal);
      map.route(pts, rtOpts);
    });
  }

  for (const { pt, s, count } of plan.waves) {
    map.waves(pt[0], pt[1], s, count);
  }

  const drawPlannedLabel = (entry) => {
    const { lbl, kind, lOpts, pt, pathPts, item } = entry;
    let written;
    if (pathPts) {
      written = map.writeAlongPath(lbl.text, pathPts, lOpts);
    } else if (kind === 'sea') {
      written = map.seaLabel(lbl.text, pt[0], pt[1], lOpts);
    } else if (kind === 'region') {
      written = map.regionLabel(lbl.text, pt[0], pt[1], lOpts);
    } else {
      written = map.label(lbl.text, pt[0], pt[1], lOpts);
    }
    if (written && item) {
      updateItemBox(item, bboxFromWrite(written));
    }
  };

  for (const entry of plan.labels) {
    if (entry.kind === 'sea' || entry.kind === 'region') drawPlannedLabel(entry);
  }

  // 7. Cities, elements, callouts, foreground labels
  for (const cEntry of plan.cities) {
    const { city, pt, dx, dy, labelItem } = cEntry;
    const cOpts = {
      capital: Boolean(city.capital),
      dx,
      dy,
      size: city.size,
      face: city.face,
      align: city.align,
      color: city.color ? resolveColor(city.color, pal) : undefined,
      sub: city.subtext ?? city.sub,
      bilingualLayout: city.bilingualLayout,
      layout: city.layout,
      secondarySize: city.secondarySize ?? city.subSize,
      secondaryFace: city.secondaryFace ?? city.subFace,
      secondaryColor: city.secondaryColor ? resolveColor(city.secondaryColor, pal) : undefined,
    };
    const written = map.city(pt[0], pt[1], city.name, cOpts);
    if (written && labelItem) {
      updateItemBox(labelItem, bboxFromWrite(written));
    }
  }

  for (const eEntry of plan.elements) {
    const { el, pt, svgOpts, item, labelEntry } = eEntry;
    const drawnBb = drawElementItem(map, el, pt, pal, svgOpts);
    if (drawnBb && item) {
      updateItemBox(item, drawnBb);
    }
    if (labelEntry) {
      const written = map.label(labelEntry.lObj.text, labelEntry.lx, labelEntry.ly, labelEntry.lOpts);
      if (written && labelEntry.item) {
        updateItemBox(labelEntry.item, bboxFromWrite(written));
      }
    }
  }

  for (const co of spec.callouts) {
    const fromPt = resolvePoint(co.from, proj, idPositions, geoContext);
    const toPt = resolvePoint(co.to, proj, idPositions, geoContext);
    if (!fromPt || !toPt) continue;
    const coOpts = {};
    if (co.bendX !== undefined) coOpts.bendX = co.bendX;
    if (co.bendY !== undefined) coOpts.bendY = co.bendY;
    if (co.color) coOpts.color = resolveColor(co.color, pal);
    map.callout(fromPt, toPt, coOpts);
  }

  for (const autoCo of plan.autoCallouts) {
    map.callout(autoCo.from, autoCo.to, { bendX: autoCo.bendX, bendY: autoCo.bendY });
  }

  for (const entry of plan.labels) {
    if (entry.kind !== 'sea' && entry.kind !== 'region') drawPlannedLabel(entry);
  }

  // 8. Insets, compass, cartouche
  for (const { ins } of plan.insets) {
    map.insetBox(ins.x, ins.y, ins.w, ins.h, ins.title);
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
      if (subProj && subGeo.admin1) {
        const subA1 = normalizeAdmin1Opts(subGeo, pal, baseDir, Boolean(subGeo.focus));
        if (subA1) map.admin1(subProj, { ...subA1, frame: clipFrame });
      }
    }
  }

  if (plan.compass) {
    const { cmp, pt, r } = plan.compass;
    let angle = 0;
    if (cmp.angle === 'auto' || cmp.angle === undefined) {
      if (proj) {
        const [lon, lat] = proj.inverse(pt[0], pt[1]);
        angle = proj.northAngle(lon, lat);
      }
    } else if (isFiniteNum(cmp.angle)) {
      angle = cmp.angle;
    }
    map.compass(pt[0], pt[1], r, {
      angle,
      rhumb: cmp.rhumb !== false,
    });
  }

  if (plan.cartouche) {
    const { c, x, y } = plan.cartouche;
    const info = {
      ...c,
      country: c.country ?? c.title,
      lang: c.lang ?? spec.meta.lang,
      facts: normalizeCartoucheFacts(c.facts),
      mmPerKm: c.mmPerKm ?? (proj ? proj.mmPerKm : undefined),
    };
    map.cartouche(x, y, c.w, c.h, info);
  }

  layout.rebuildGrid();
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
