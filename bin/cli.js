#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { loadCountries } = require('../src/geo');
const EL = require('../src/elements');
const { FLAGS } = require('../src/flags');
const { POSES } = require('../engine/lib/people');
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
    --auto-layout       Enable auto-layout hints (extended in PR 5)

  inspect <kind> [q]    Inspect built-in assets or plan a spec without rasterizing.
    countries [query]   Search Natural Earth countries (id, iso2, name, continent, mainBBox)
    elements [query]    List built-in illustrated elements and person poses
    flags [query]       List built-in waving flag codes
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
    fs.mkdirSync(path.dirname(path.resolve(diagPath)), { recursive: true });
    fs.writeFileSync(diagPath, JSON.stringify(diagnostics, null, 2) + '\n', 'utf8');
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
    process.stderr.write('Error: missing inspect target (countries | elements | flags | spec).\n');
    return 1;
  }

  if (kind === 'countries') {
    const q = query ? query.toLowerCase() : '';
    const { countries } = loadCountries();
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

  if (kind === 'elements') {
    const q = query ? query.toLowerCase() : '';
    const elementNames = Object.keys(EL).filter((n) => !q || n.toLowerCase().includes(q));
    const poses = Object.keys(POSES).filter((p) => !q || p.toLowerCase().includes(q) || 'person'.includes(q));
    const data = {
      elements: elementNames.map((name) => ({
        name,
        bounds: ELEMENT_BOUNDS[name] || null,
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

  if (kind === 'spec') {
    if (!query) {
      process.stderr.write('Error: inspect spec requires a <file> path.\n');
      return 1;
    }
    let plan;
    try {
      plan = planSpec(query);
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

  process.stderr.write(`Error: unknown inspect kind "${kind}". Supported kinds: countries, elements, flags, spec.\n`);
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
