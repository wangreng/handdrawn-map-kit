'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI_PATH = path.join(REPO_ROOT, 'bin', 'cli.js');
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeTempDir(prefix = 'handdrawn-map-e2e-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withTempDir(t, prefix = 'handdrawn-map-e2e-') {
  const dir = makeTempDir(prefix);
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function runCli(args, opts = {}) {
  assert.ok(fs.existsSync(CLI_PATH), `CLI entrypoint missing: ${CLI_PATH}`);
  const res = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: opts.cwd || REPO_ROOT,
    env: opts.env || process.env,
    encoding: 'utf8',
    timeout: opts.timeout ?? 60000,
    maxBuffer: opts.maxBuffer ?? 16 * 1024 * 1024,
  });
  return {
    status: res.status,
    signal: res.signal || null,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    error: res.error || null,
  };
}

function parsePngIhdr(bufOrPath) {
  const buf = Buffer.isBuffer(bufOrPath) ? bufOrPath : fs.readFileSync(bufOrPath);
  assert.ok(buf.length >= 33, `PNG buffer too small (${buf.length} bytes)`);
  assert.ok(buf.subarray(0, 8).equals(PNG_SIG), 'Invalid PNG 8-byte signature');
  assert.equal(buf.readUInt32BE(8), 13, 'Invalid IHDR chunk length (expected 13)');
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR', 'Missing IHDR chunk at offset 12');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.ok(width > 0 && height > 0, `Invalid PNG dimensions (${width}x${height})`);
  return {
    width,
    height,
    bitDepth: buf[24],
    colorType: buf[25],
  };
}

async function decodePngPixels(bufOrPath) {
  const { loadImage, createCanvas } = require('@napi-rs/canvas');
  const img = await loadImage(bufOrPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  return {
    width: imageData.width,
    height: imageData.height,
    data: imageData.data,
  };
}

function assertValidBBox(bbox, label = 'bbox') {
  assert.ok(bbox && typeof bbox === 'object', `${label}: expected object bbox`);
  for (const key of ['x', 'y', 'w', 'h', 'x0', 'y0', 'x1', 'y1']) {
    assert.equal(
      typeof bbox[key],
      'number',
      `${label}.${key}: expected number, got ${typeof bbox[key]}`
    );
    assert.ok(Number.isFinite(bbox[key]), `${label}.${key}: expected finite number, got ${bbox[key]}`);
  }
  assert.ok(Math.abs(bbox.x - bbox.x0) < 1e-6, `${label}: x (${bbox.x}) !== x0 (${bbox.x0})`);
  assert.ok(Math.abs(bbox.y - bbox.y0) < 1e-6, `${label}: y (${bbox.y}) !== y0 (${bbox.y0})`);
  assert.ok(
    Math.abs(bbox.x1 - (bbox.x + bbox.w)) < 1e-6,
    `${label}: x1 (${bbox.x1}) !== x + w (${bbox.x + bbox.w})`
  );
  assert.ok(
    Math.abs(bbox.y1 - (bbox.y + bbox.h)) < 1e-6,
    `${label}: y1 (${bbox.y1}) !== y + h (${bbox.y + bbox.h})`
  );
  assert.ok(bbox.w >= 0, `${label}: w (${bbox.w}) must be >= 0`);
  assert.ok(bbox.h >= 0, `${label}: h (${bbox.h}) must be >= 0`);
}

function clampPatchBounds(img, bboxMm, ppm, padMm = 0) {
  const rawX0 = bboxMm.x0 ?? bboxMm.x;
  const rawY0 = bboxMm.y0 ?? bboxMm.y;
  const rawX1 = bboxMm.x1 ?? (bboxMm.x + bboxMm.w);
  const rawY1 = bboxMm.y1 ?? (bboxMm.y + bboxMm.h);
  if (rawX1 - rawX0 <= 0 || rawY1 - rawY0 <= 0) {
    return { px0: 0, py0: 0, px1: 0, py1: 0 };
  }
  const x0 = rawX0 - padMm;
  const y0 = rawY0 - padMm;
  const x1 = rawX1 + padMm;
  const y1 = rawY1 + padMm;
  if (x1 <= x0 || y1 <= y0) {
    return { px0: 0, py0: 0, px1: 0, py1: 0 };
  }
  const px0 = Math.max(0, Math.floor(x0 * ppm));
  const py0 = Math.max(0, Math.floor(y0 * ppm));
  const px1 = Math.min(img.width, Math.ceil(x1 * ppm));
  const py1 = Math.min(img.height, Math.ceil(y1 * ppm));
  return { px0, py0, px1, py1 };
}

function medianOf(arr) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function countInkInBBox(img, bboxMm, ppm, opts = {}) {
  const darkLumThreshold = opts.darkLumThreshold ?? 150;
  const bgDistThreshold = opts.bgDistThreshold ?? 25;
  const padMm = opts.padMm ?? 0;
  const { px0, py0, px1, py1 } = clampPatchBounds(img, bboxMm, ppm, padMm);

  if (px1 <= px0 || py1 <= py0) {
    return {
      darkInkCount: 0,
      nonBgCount: 0,
      totalPixels: 0,
      darkRatio: 0,
      nonBgRatio: 0,
      bgRgb: [0, 0, 0],
    };
  }

  const borderR = [];
  const borderG = [];
  const borderB = [];
  const pushBorderPixel = (px, py) => {
    const idx = (py * img.width + px) * 4;
    borderR.push(img.data[idx]);
    borderG.push(img.data[idx + 1]);
    borderB.push(img.data[idx + 2]);
  };

  for (let px = px0; px < px1; px++) {
    pushBorderPixel(px, py0);
    if (py1 - 1 > py0) pushBorderPixel(px, py1 - 1);
  }
  for (let py = py0 + 1; py < py1 - 1; py++) {
    pushBorderPixel(px0, py);
    if (px1 - 1 > px0) pushBorderPixel(px1 - 1, py);
  }

  const bgR = medianOf(borderR);
  const bgG = medianOf(borderG);
  const bgB = medianOf(borderB);

  let darkInkCount = 0;
  let nonBgCount = 0;
  let totalPixels = 0;

  for (let py = py0; py < py1; py++) {
    for (let px = px0; px < px1; px++) {
      const idx = (py * img.width + px) * 4;
      const r = img.data[idx];
      const g = img.data[idx + 1];
      const b = img.data[idx + 2];
      totalPixels++;

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < darkLumThreshold) darkInkCount++;

      const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
      if (dist > bgDistThreshold) nonBgCount++;
    }
  }

  return {
    darkInkCount,
    nonBgCount,
    totalPixels,
    darkRatio: totalPixels > 0 ? darkInkCount / totalPixels : 0,
    nonBgRatio: totalPixels > 0 ? nonBgCount / totalPixels : 0,
    bgRgb: [bgR, bgG, bgB],
  };
}

function computePatchDiffRatio(imgA, imgB, bboxMm, ppm, opts = {}) {
  assert.equal(imgA.width, imgB.width, 'computePatchDiffRatio: image widths must match');
  assert.equal(imgA.height, imgB.height, 'computePatchDiffRatio: image heights must match');
  const channelSumThreshold = opts.channelSumThreshold ?? 45;
  const darkLumThreshold = opts.darkLumThreshold ?? 175;
  const padMm = opts.padMm ?? 0;
  const { px0, py0, px1, py1 } = clampPatchBounds(imgA, bboxMm, ppm, padMm);

  let diffPixels = 0;
  let totalPixels = 0;
  let unionInkPixels = 0;
  let inkDiffPixels = 0;

  for (let py = py0; py < py1; py++) {
    for (let px = px0; px < px1; px++) {
      const idx = (py * imgA.width + px) * 4;
      const rA = imgA.data[idx];
      const gA = imgA.data[idx + 1];
      const bA = imgA.data[idx + 2];
      const rB = imgB.data[idx];
      const gB = imgB.data[idx + 1];
      const bB = imgB.data[idx + 2];
      totalPixels++;

      const lumA = 0.299 * rA + 0.587 * gA + 0.114 * bA;
      const lumB = 0.299 * rB + 0.587 * gB + 0.114 * bB;
      const hasInk = lumA < darkLumThreshold || lumB < darkLumThreshold;
      if (hasInk) unionInkPixels++;

      const delta = Math.abs(rA - rB) + Math.abs(gA - gB) + Math.abs(bA - bB);
      if (delta > channelSumThreshold) {
        diffPixels++;
        if (hasInk) inkDiffPixels++;
      }
    }
  }

  return {
    diffPixels,
    totalPixels,
    diffRatio: totalPixels > 0 ? diffPixels / totalPixels : 0,
    unionInkPixels,
    inkDiffRatio: unionInkPixels > 0 ? inkDiffPixels / unionInkPixels : 0,
  };
}

function writeSpecFile(dir, filename, content) {
  const filePath = path.join(dir, filename);
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(filePath, text, 'utf8');
  return filePath;
}

function assertDiagnosticsSchema(diag) {
  assert.ok(diag && typeof diag === 'object', 'diagnostics must be an object');
  assert.equal(diag.schemaVersion, 1, 'diagnostics.schemaVersion must be 1');

  assert.ok(diag.canvas && typeof diag.canvas === 'object', 'diagnostics.canvas must be an object');
  assert.ok(Number.isFinite(diag.canvas.w) && diag.canvas.w > 0, 'canvas.w must be positive finite');
  assert.ok(Number.isFinite(diag.canvas.h) && diag.canvas.h > 0, 'canvas.h must be positive finite');
  assert.ok(Number.isFinite(diag.canvas.ppm) && diag.canvas.ppm > 0, 'canvas.ppm must be positive finite');
  assert.ok(
    Array.isArray(diag.canvas.safeFrame) && diag.canvas.safeFrame.length === 4,
    'canvas.safeFrame must be a 4-element array'
  );
  for (const v of diag.canvas.safeFrame) {
    assert.ok(Number.isFinite(v), 'canvas.safeFrame entries must be finite numbers');
  }

  assert.ok(diag.summary && typeof diag.summary === 'object', 'diagnostics.summary must be an object');
  for (const key of [
    'totalItems',
    'overlapCount',
    'outOfBoundsCount',
    'landCoveragePct',
    'seaCoveragePct',
  ]) {
    assert.ok(
      typeof diag.summary[key] === 'number' && Number.isFinite(diag.summary[key]),
      `summary.${key} must be a finite number`
    );
  }

  for (const arrKey of ['items', 'overlaps', 'outOfBounds', 'emptyRegions', 'warnings']) {
    assert.ok(Array.isArray(diag[arrKey]), `diagnostics.${arrKey} must be an array`);
  }

  assert.equal(diag.summary.totalItems, diag.items.length, 'summary.totalItems must match items.length');
  assert.equal(diag.summary.overlapCount, diag.overlaps.length, 'summary.overlapCount must match overlaps.length');
  assert.equal(
    diag.summary.outOfBoundsCount,
    diag.outOfBounds.length,
    'summary.outOfBoundsCount must match outOfBounds.length'
  );

  for (const item of diag.items) {
    assert.equal(typeof item.id, 'string', 'diagnostics item must have string id');
    assertValidBBox(item, `diagnostics.item(${item.id})`);
  }
}

function requireModule(relPath) {
  return require(path.join(REPO_ROOT, relPath));
}

module.exports = {
  REPO_ROOT,
  CLI_PATH,
  makeTempDir,
  withTempDir,
  runCli,
  parsePngIhdr,
  decodePngPixels,
  assertValidBBox,
  countInkInBBox,
  computePatchDiffRatio,
  writeSpecFile,
  assertDiagnosticsSchema,
  requireModule,
};
