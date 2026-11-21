#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const GEO = require('../src/geo');
const EL = require('../src/elements');
const { FLAGS } = require('../src/flags');
const { POSES } = require('../engine/lib/people');
const Lt = require('../engine/lib/letter');
const { ELEMENT_BOUNDS } = require('../src/layout');
const { loadSpec, planSpec, renderSpec } = require('../src/spec');

const HELP_TEXT = `Usage:
  handdrawn-map render <spec> [options]
  handdrawn-map inspect <kind> [query] [--json]
  handdrawn-map --help

Commands:
  render <spec>         Render a JSON or YAML map spec to PNG.
    -o, --out <file>    Output PNG path (default: out/<id-or-stem>.png)
    --fast              Fast preview resolution (ppm = 5)
    --hd                High-definition resolution (ppm = 10)
    --ppm <n>           Explicit pixels per mm (overrides --fast/--hd)
    --diagnostics <p|-> Write layout diagnostics JSON to file or "-" for stdout
    --seed <str>        Override RNG seed
    --no-border         Omit zebra border frame
    --auto-layout       Enable automatic empty-space placement & overlap avoidance

  inspect <kind> [q]    Inspect built-in assets or plan a spec without rasterizing.
    countries [query]   Search Natural Earth countries (id, iso2, name, continent, mainBBox)
    admin1 [query]      Search Natural Earth admin-1 states/provinces (by country or name/zh/ISO)
    places [query]      Search Natural Earth populated places (by country or city name/zh/ja/ko)
    rivers [query]      Search Natural Earth major rivers
    elements [query]    List built-in illustrated elements and person poses
    flags [query]       List built-in waving flag codes
    fonts [query]       List registered Latin & CJK fonts
    spec <file>         Validate & plan a spec (projection + layout diagnostics)
    --json              Output machine-readable JSON
`;

function sanitizeId(raw) {
  return String(raw || 'map')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'map';
}

function defaultOutPath(specPath, specObj) {
  const id = specObj && specObj.meta && specObj.meta.id;
  const stem = id
    ? sanitizeId(id)
    : sanitizeId(path.basename(specPath, path.extname(specPath)));
  return path.join('out', `${stem}.png`);
}

async function handleRender(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o' },
        fast: { type: 'boolean' },
        hd: { type: 'boolean' },
        ppm: { type: 'string' },
        diagnostics: { type: 'string' },
        seed: { type: 'string' },
        'no-border': { type: 'boolean' },
        'auto-layout': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    return 1;
  }

  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  const specPath = positionals[0];
  if (!specPath) {
    process.stderr.write('Error: missing <spec> file path.\n\n' + HELP_TEXT);
    return 1;
  }

  let ppm;
  if (values.ppm !== undefined) {
    ppm = Number(values.ppm);
    if (!Number.isFinite(ppm) || ppm <= 0) {
      process.stderr.write(`Error: --ppm must be a positive number (got "${values.ppm}").\n`);
      return 1;
    }
  } else if (values.fast) {
    ppm = 5;
  } else if (values.hd) {
    ppm = 10;
  }

  const renderOpts = {};
  if (ppm !== undefined) renderOpts.ppm = ppm;
  if (values.seed !== undefined) renderOpts.seed = values.seed;
  if (values['no-border']) renderOpts.border = false;
  if (values['auto-layout']) renderOpts.autoLayout = true;

  let loadedSpec;
  try {
    loadedSpec = loadSpec(specPath);
  } catch (err) {
    process.stderr.write(`Error loading spec "${specPath}": ${err.message}\n`);
    return 1;
  }

  const outPath = values.out || defaultOutPath(specPath, loadedSpec);
  const t0 = Date.now();
  let result;
  try {
    result = renderSpec(loadedSpec, renderOpts);
    await result.save(outPath);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    return 1;
  }
  const elapsedMs = Date.now() - t0;

  const { diagnostics } = result;
  const summaryLine =
    `Rendered ${outPath} (${diagnostics.canvas.w}x${diagnostics.canvas.h}mm @ ${diagnostics.canvas.ppm}ppm, ` +
    `items=${diagnostics.summary.totalItems}, overlaps=${diagnostics.summary.overlapCount}, ` +
    `oob=${diagnostics.summary.outOfBoundsCount}, ${elapsedMs}ms)\n`;

  if (values.diagnostics === '-') {
    process.stdout.write(JSON.stringify(diagnostics, null, 2) + '\n');
    process.stderr.write(summaryLine);
  } else if (values.diagnostics) {
    const diagPath = values.diagnostics;
    try {
      fs.mkdirSync(path.dirname(path.resolve(diagPath)), { recursive: true });
      fs.writeFileSync(diagPath, JSON.stringify(diagnostics, null, 2) + '\n', 'utf8');
    } catch (err) {
      process.stderr.write(`Error writing diagnostics "${diagPath}": ${err.message}\n`);
      return 1;
    }
    process.stdout.write(summaryLine);
    process.stdout.write(`Diagnostics written to ${diagPath}\n`);
  } else {
    process.stdout.write(summaryLine);
  }

  return 0;
}

function handleInspect(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: true,
      options: {
        json: { type: 'boolean' },
        'auto-layout': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    return 1;
  }

  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  const kind = positionals[0];
  const query = positionals[1];
  const asJson = Boolean(values.json);

  if (!kind) {
    process.stderr.write('Error: missing inspect target (countries | admin1 | places | rivers | elements | flags | fonts | spec).\n');
    return 1;
  }

  if (kind === 'countries') {
    const q = query ? query.toLowerCase() : '';
    const { countries } = GEO.loadCountries();
    const matches = countries
      .filter((c) => {
        if (!q) return true;
        return (
          c.id.toLowerCase().includes(q) ||
          (c.iso2 && c.iso2.toLowerCase().includes(q)) ||
          c.name.toLowerCase().includes(q) ||
          (c.continent && c.continent.toLowerCase().includes(q))
        );
      })
      .map((c) => ({
        id: c.id,
        iso2: c.iso2,
        name: c.name,
        continent: c.continent,
        mainBBox: c.mainBBox,
      }));

    if (asJson) {
      process.stdout.write(JSON.stringify(matches, null, 2) + '\n');
    } else {
      for (const c of matches) {
        process.stdout.write(`${c.id}\t${c.iso2 || '--'}\t${c.name}\t[${c.mainBBox.map((n) => n.toFixed(1)).join(', ')}]\n`);
      }
      process.stdout.write(`(${matches.length} countries)\n`);
    }
    return 0;
  }

  if (kind === 'admin1') {
    let matches = [];
    if (query) {
      const country = GEO.findCountry(query);
      if (country) {
        matches = GEO.listAdmin1(country.id);
      } else {
        const q = query.toLowerCase();
        const qNorm = GEO.norm(query);
        const ds = GEO.loadAdmin1();
        matches = ds.regions
          .filter((r) => (
            (r.id && r.id.toLowerCase().includes(q)) ||
            (r.iso && r.iso.toLowerCase().includes(q)) ||
            (r.name && (r.name.toLowerCase().includes(q) || GEO.norm(r.name).includes(qNorm))) ||
            (r.zh && r.zh.includes(query)) ||
            (r.local && r.local.toLowerCase().includes(q)) ||
            (r.adm0 && r.adm0.toLowerCase().includes(q)) ||
            (Array.isArray(r.names) && r.names.some((n) => n.toLowerCase().includes(q) || GEO.norm(n).includes(qNorm)))
          ))
          .map((r) => ({
            id: r.id,
            adm0: r.adm0,
            name: r.name,
            zh: r.zh,
            local: r.local,
            region: r.region,
            type: r.type,
            bbox: r.bbox,
            mainBBox: r.mainBBox,
          }));
      }
    } else {
      const ds = GEO.loadAdmin1();
      matches = ds.regions.map((r) => ({
        id: r.id,
        adm0: r.adm0,
        name: r.name,
        zh: r.zh,
        local: r.local,
        region: r.region,
        type: r.type,
        bbox: r.bbox,
        mainBBox: r.mainBBox,
      }));
    }

    if (asJson) {
      process.stdout.write(JSON.stringify(matches, null, 2) + '\n');
    } else {
      for (const r of matches) {
        process.stdout.write(`${r.id || '--'}\t${r.adm0}\t${r.name}${r.zh ? ` (${r.zh})` : ''}\t[${r.mainBBox.map((n) => n.toFixed(1)).join(', ')}]\n`);
      }
      process.stdout.write(`(${matches.length} admin1 regions)\n`);
    }
    return 0;
  }

  if (kind === 'places') {
    const ds = GEO.loadPlaces();
    let matches = ds.places;
    if (query) {
      const country = GEO.findCountry(query);
      const q = query.toLowerCase();
      const qNorm = GEO.norm(query);
      if (country) {
        matches = ds.places.filter((p) => p.adm0 === country.id);
      } else {
        matches = ds.places.filter((p) => (
          (p.name && (p.name.toLowerCase().includes(q) || GEO.norm(p.name).includes(qNorm))) ||
          (p.ascii && p.ascii.toLowerCase().includes(q)) ||
          (p.zh && p.zh.includes(query)) ||
          (p.ja && p.ja.includes(query)) ||
          (p.ko && p.ko.includes(query)) ||
          (p.adm0 && p.adm0.toLowerCase().includes(q)) ||
          (p.adm1 && p.adm1.toLowerCase().includes(q)) ||
          (Array.isArray(p.names) && p.names.some((n) => n.toLowerCase().includes(q) || GEO.norm(n).includes(qNorm)))
        ));
      }
    }
    const sorted = matches
      .slice()
      .sort((a, b) => (Number(!!b.capital) - Number(!!a.capital)) || ((b.pop || 0) - (a.pop || 0)))
      .map((p) => ({
        name: p.name,
        zh: p.zh,
        ja: p.ja,
        ko: p.ko,
        adm0: p.adm0,
        adm1: p.adm1,
        lon: p.lon,
        lat: p.lat,
        pop: p.pop,
        rank: p.rank,
        capital: Boolean(p.capital),
      }));

    if (asJson) {
      process.stdout.write(JSON.stringify(sorted, null, 2) + '\n');
    } else {
      for (const p of sorted) {
        const star = p.capital ? '*' : ' ';
        process.stdout.write(`${star}\t${p.adm0}\t${p.name}${p.zh ? ` (${p.zh})` : ''}\t${p.lon.toFixed(2)}, ${p.lat.toFixed(2)}\n`);
      }
      process.stdout.write(`(${sorted.length} places)\n`);
    }
    return 0;
  }

  if (kind === 'rivers') {
    const ds = GEO.loadRivers();
    const q = query ? query.toLowerCase() : '';
    const qNorm = query ? GEO.norm(query) : '';
    const matches = ds.rivers
      .filter((r) => {
        if (!q) return true;
        return (
          (r.name && (r.name.toLowerCase().includes(q) || GEO.norm(r.name).includes(qNorm))) ||
          (r.zh && r.zh.includes(query)) ||
          (Array.isArray(r.names) && r.names.some((n) => n.toLowerCase().includes(q) || GEO.norm(n).includes(qNorm)))
        );
      })
      .sort((a, b) => ((a.rank ?? 99) - (b.rank ?? 99)) || String(a.name || '').localeCompare(String(b.name || '')))
      .map((r) => ({
        name: r.name,
        zh: r.zh,
        kind: r.kind,
        rank: r.rank,
        bbox: r.bbox,
      }));

    if (asJson) {
      process.stdout.write(JSON.stringify(matches, null, 2) + '\n');
    } else {
      for (const r of matches) {
        process.stdout.write(`r${r.rank ?? '-'}\t${r.name || '--'}${r.zh ? ` (${r.zh})` : ''}\t${r.kind || ''}\n`);
      }
      process.stdout.write(`(${matches.length} rivers)\n`);
    }
    return 0;
  }

  if (kind === 'elements') {
    const q = query ? query.toLowerCase() : '';
    const elementNames = Object.keys(EL).filter((n) => !q || n.toLowerCase().includes(q));
    const poses = Object.keys(POSES).filter((p) => !q || p.toLowerCase().includes(q) || 'person'.includes(q));
    const data = {
      elements: elementNames.map((name) => ({
        name,
        bounds: ELEMENT_BOUNDS[name] || null,
        meta: EL.ELEMENT_META[name] || null,
      })),
      poses,
    };

    if (asJson) {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    } else {
      process.stdout.write(`Elements (${elementNames.length}): ${elementNames.join(', ')}\n`);
      process.stdout.write(`Person poses (${poses.length}): ${poses.join(', ')}\n`);
    }
    return 0;
  }

  if (kind === 'flags') {
    const q = query ? query.toLowerCase() : '';
    const codes = Object.keys(FLAGS).filter((code) => !q || code.toLowerCase().includes(q));
    if (asJson) {
      process.stdout.write(JSON.stringify(codes, null, 2) + '\n');
    } else {
      process.stdout.write(`Flags (${codes.length}): ${codes.join(', ')}\n`);
    }
    return 0;
  }

  if (kind === 'fonts') {
    const q = query ? query.toLowerCase() : '';
    const fonts = Lt.listFonts().filter((f) => {
      if (!q) return true;
      return (
        (f.name && f.name.toLowerCase().includes(q)) ||
        (f.source && f.source.toLowerCase().includes(q)) ||
        (Array.isArray(f.scripts) && f.scripts.some((s) => s.toLowerCase().includes(q))) ||
        (Array.isArray(f.faces) && f.faces.some((s) => s.toLowerCase().includes(q)))
      );
    });

    if (asJson) {
      process.stdout.write(JSON.stringify(fonts, null, 2) + '\n');
    } else {
      for (const f of fonts) {
        process.stdout.write(`${f.name}\t[${(f.scripts || []).join(',')}]\t(${f.source || 'unknown'})\n`);
      }
      process.stdout.write(`(${fonts.length} fonts)\n`);
    }
    return 0;
  }

  if (kind === 'spec') {
    if (!query) {
      process.stderr.write('Error: inspect spec requires a <file> path.\n');
      return 1;
    }
    let plan;
    try {
      plan = planSpec(query, values['auto-layout'] ? { autoLayout: true } : {});
    } catch (err) {
      process.stderr.write(`Error loading spec "${query}": ${err.message}\n`);
      return 1;
    }

    const payload = {
      ok: plan.ok,
      errors: plan.errors,
      warnings: plan.warnings,
      projection: plan.proj ? plan.proj.params : null,
      diagnostics: plan.diagnostics,
    };

    if (asJson) {
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    } else if (!plan.ok) {
      process.stderr.write(`Spec INVALID (${plan.errors.length} errors):\n`);
      for (const e of plan.errors) process.stderr.write(`  - ${e}\n`);
    } else {
      const d = plan.diagnostics;
      process.stdout.write(
        `Spec OK: ${d.canvas.w}x${d.canvas.h}mm @ ${d.canvas.ppm}ppm, ` +
        `items=${d.summary.totalItems}, overlaps=${d.summary.overlapCount}, ` +
        `oob=${d.summary.outOfBoundsCount}, land=${d.summary.landCoveragePct}%, sea=${d.summary.seaCoveragePct}%\n`
      );
      if (plan.warnings.length) {
        process.stdout.write(`Warnings (${plan.warnings.length}):\n`);
        for (const w of plan.warnings) process.stdout.write(`  - ${w}\n`);
      }
    }
    return plan.ok ? 0 : 1;
  }

  process.stderr.write(`Error: unknown inspect kind "${kind}". Supported kinds: countries, admin1, places, rivers, elements, flags, fonts, spec.\n`);
  return 1;
}

async function runCli(argv) {
  const args = argv.slice();
  if (args.length === 0) {
    process.stderr.write(HELP_TEXT);
    return 1;
  }
  if (args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  const cmd = args[0];
  const rest = args.slice(1);
  if (cmd === 'render') return handleRender(rest);
  if (cmd === 'inspect') return handleInspect(rest);

  process.stderr.write(`Error: unknown command "${cmd}".\n\n` + HELP_TEXT);
  return 1;
}

if (require.main === module) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(`Fatal error: ${err && err.message ? err.message : err}\n`);
      process.exitCode = 1;
    });
}

module.exports = { runCli };
