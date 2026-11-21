'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  withTempDir,
  runCli,
  parsePngIhdr,
  decodePngPixels,
  assertValidBBox,
  countInkInBBox,
  writeSpecFile,
  assertDiagnosticsSchema,
} = require('./helpers');

test('T3-01: admin-1 + auto rivers + auto lakes + CJK bilingual cities via CLI with diagnostics', async (t) => {
  const dir = withTempDir(t, 'e2e-t3-01-');
  const specPath = writeSpecFile(dir, 'sichuan-geo.json', {
    schemaVersion: 1,
    meta: { id: 't3-01', title: '四川水系', lang: 'zh', seed: 't3-01-seed' },
    canvas: { w: 240, h: 160 },
    geo: {
      fit: { target: { country: 'China', admin1: 'Sichuan' } },
      focus: ['China'],
      admin1: { country: 'China', highlight: ['Sichuan'] },
    },
    layers: {
      rivers: { auto: true },
      lakes: { auto: true },
      cities: { auto: true, max: 6, bilingual: true },
    },
    labels: [
      { id: 'lbl-cd', text: '成都', subtext: 'Chengdu', lon: 104.06, lat: 30.67, size: 3.2 },
      { id: 'lbl-cq', text: '重庆', subtext: 'Chongqing', lon: 106.55, lat: 29.56, size: 3.0 },
    ],
  });
  const outPng = path.join(dir, 't3-01.png');
  const outDiag = path.join(dir, 't3-01.diag.json');

  const res = runCli(['render', specPath, '-o', outPng, '--ppm', '4', '--auto-layout', '--diagnostics', outDiag]);
  assert.equal(res.status, 0, `T3-01 CLI failed: ${res.stderr}`);
  const ihdr = parsePngIhdr(outPng);
  assert.equal(ihdr.width, 960);
  assert.equal(ihdr.height, 640);

  const diag = JSON.parse(fs.readFileSync(outDiag, 'utf8'));
  assertDiagnosticsSchema(diag);
  assert.ok(diag.items.length >= 2, 'Expected bilingual city labels in diagnostics');

  const img = await decodePngPixels(outPng);
  const cdItem = diag.items.find((it) => it.id === 'lbl-cd');
  assert.ok(cdItem, 'Expected lbl-cd in diagnostics');
  const ink = countInkInBBox(img, cdItem, 4, { padMm: 1.5 });
  assert.ok(ink.darkInkCount > 20, 'Expected visible dark ink inside Chengdu bilingual label bbox');
});

test('T3-02: inline SVG elements (pencil & wash) + callouts + diagnostics bbox ink verification', async (t) => {
  const dir = withTempDir(t, 'e2e-t3-02-');
  const specPath = writeSpecFile(dir, 'svg-callouts.json', {
    schemaVersion: 1,
    meta: { id: 't3-02', seed: 't3-02-seed' },
    canvas: { w: 220, h: 150 },
    geo: { fit: { target: 'Italy' }, focus: ['Italy'] },
    elements: [
      {
        id: 'svg-pencil-arch',
        type: 'svg',
        x: 60,
        y: 70,
        options: { width: 18, fillStyle: 'pencil' },
        svg: '<svg viewBox="0 0 24 24"><path d="M2 22 L2 8 Q12 0 22 8 L22 22 L16 22 L16 12 Q12 9 8 12 L8 22 Z" fill="#d9a86c" stroke="#1d1a1e"/></svg>',
      },
      {
        id: 'svg-wash-vase',
        type: 'svg',
        x: 155,
        y: 85,
        options: { width: 16, fillStyle: 'wash' },
        svg: '<svg viewBox="0 0 20 24"><ellipse cx="10" cy="14" rx="7" ry="8" fill="#c85a3a" stroke="#1d1a1e"/><rect x="7" y="2" width="6" height="5" fill="#c85a3a" stroke="#1d1a1e"/></svg>',
      },
    ],
    callouts: [
      { from: [60, 70], to: [38, 46] },
      { from: [155, 85], to: [178, 56] },
    ],
    labels: [
      { id: 'cap-arch', text: 'Arch Monument', x: 38, y: 42, size: 2.6 },
      { id: 'cap-vase', text: 'Terracotta', x: 178, y: 52, size: 2.6 },
    ],
  });
  const outPng = path.join(dir, 't3-02.png');
  const outDiag = path.join(dir, 't3-02.diag.json');

  const res = runCli(['render', specPath, '-o', outPng, '--ppm', '4', '--diagnostics', outDiag]);
  assert.equal(res.status, 0, `T3-02 CLI failed: ${res.stderr}`);
  const diag = JSON.parse(fs.readFileSync(outDiag, 'utf8'));
  assertDiagnosticsSchema(diag);

  const img = await decodePngPixels(outPng);
  for (const id of ['svg-pencil-arch', 'svg-wash-vase']) {
    const item = diag.items.find((it) => it.id === id);
    assert.ok(item, `Expected ${id} in diagnostics items`);
    assertValidBBox(item, id);
    const ink = countInkInBBox(img, item, 4, { padMm: 1 });
    assert.ok(ink.nonBgCount > 30, `Expected visible ink inside ${id} diagnostics bbox`);
  }
});

test('T3-03: YAML spec + --fast (1500x1000) vs --hd (3000x2000) 2x IHDR scaling + --seed determinism', (t) => {
  const dir = withTempDir(t, 'e2e-t3-03-');
  const yamlText = [
    'schemaVersion: 1',
    'meta:',
    '  id: t3-03-yaml-hd',
    '  title: Japan',
    '  seed: yaml-det-seed',
    'page:',
    '  w: 300',
    '  h: 200',
    'region:',
    '  fit:',
    '    target: Japan',
    '  focus:',
    '    - Japan',
    '  waterlines: true',
    'cartouche:',
    '  x: 14',
    '  y: 14',
    '  w: 72',
    '  h: 36',
    '  country: JAPAN',
    '  flag: JPN',
  ].join('\n');
  const yamlPath = writeSpecFile(dir, 'japan.yaml', yamlText);

  const fastA = path.join(dir, 'fastA.png');
  const fastB = path.join(dir, 'fastB.png');
  const hdOut = path.join(dir, 'hd.png');

  const rFastA = runCli(['render', yamlPath, '-o', fastA, '--fast', '--seed', 'det-99']);
  assert.equal(rFastA.status, 0, `fastA failed: ${rFastA.stderr}`);
  const rFastB = runCli(['render', yamlPath, '-o', fastB, '--fast', '--seed', 'det-99']);
  assert.equal(rFastB.status, 0, `fastB failed: ${rFastB.stderr}`);
  const rHd = runCli(['render', yamlPath, '-o', hdOut, '--hd', '--seed', 'det-99'], { timeout: 120000 });
  assert.equal(rHd.status, 0, `hd failed: ${rHd.stderr}`);

  const fastIhdr = parsePngIhdr(fastA);
  const hdIhdr = parsePngIhdr(hdOut);
  assert.equal(fastIhdr.width, 1500);
  assert.equal(fastIhdr.height, 1000);
  assert.equal(hdIhdr.width, fastIhdr.width * 2, 'Expected --hd width to be 2x --fast width');
  assert.equal(hdIhdr.height, fastIhdr.height * 2, 'Expected --hd height to be 2x --fast height');

  assert.ok(fs.readFileSync(fastA).equals(fs.readFileSync(fastB)), 'Identical --seed must produce byte-identical PNG');
});

test('T3-04: --auto-layout + placement: auto cartouche & compass in sea space + --no-border + zero overlaps', async (t) => {
  const dir = withTempDir(t, 'e2e-t3-04-');
  const specPath = writeSpecFile(dir, 'auto-sea.json', {
    schemaVersion: 1,
    meta: { id: 't3-04', seed: 't3-04-seed' },
    canvas: { w: 280, h: 180 },
    geo: { fit: { target: 'Italy' }, focus: ['Italy'], waterlines: true },
    layout: { autoPlace: true, avoidOverlap: true, padding: 1.5 },
    cartouche: { placement: 'auto', w: 68, h: 34, country: 'ITALY', flag: 'ITA' },
    compass: { placement: 'auto', r: 7.5 },
    labels: [
      { id: 'city-rome', text: 'Roma', lon: 12.496, lat: 41.902, size: 3.0 },
      { id: 'city-florence', text: 'Firenze', lon: 11.255, lat: 43.769, size: 2.8 },
    ],
  });
  const outPng = path.join(dir, 't3-04.png');
  const outDiag = path.join(dir, 't3-04.diag.json');

  const res = runCli([
    'render', specPath, '-o', outPng, '--ppm', '4', '--no-border', '--auto-layout', '--diagnostics', outDiag,
  ]);
  assert.equal(res.status, 0, `T3-04 CLI failed: ${res.stderr}`);
  const diag = JSON.parse(fs.readFileSync(outDiag, 'utf8'));
  assertDiagnosticsSchema(diag);
  assert.equal(diag.overlaps.length, 0, 'Expected zero overlaps');
  assert.equal(diag.outOfBounds.length, 0, 'Expected zero out-of-bounds items');

  // Verify auto-placed cartouche & compass actually exist in diagnostics and rendered ink
  const cartItem = diag.items.find((it) => it.kind === 'cartouche' || /cartouche/i.test(it.id));
  const compItem = diag.items.find((it) => it.kind === 'compass' || /compass/i.test(it.id));
  assert.ok(cartItem, 'Expected auto-placed cartouche in diagnostics items');
  assert.ok(compItem, 'Expected auto-placed compass in diagnostics items');
  assert.ok(cartItem.w >= 60 && cartItem.h >= 30, 'Expected cartouche bbox to reflect configured dimensions');
  assert.ok(compItem.w >= 10 && compItem.h >= 10, 'Expected compass bbox to reflect configured radius');

  const noBorderImg = await decodePngPixels(outPng);
  const cartInk = countInkInBBox(noBorderImg, cartItem, 4, { padMm: 1 });
  const compInk = countInkInBBox(noBorderImg, compItem, 4, { padMm: 1 });
  assert.ok(cartInk.darkInkCount > 50, 'Expected visible dark ink inside auto-placed cartouche');
  assert.ok(compInk.darkInkCount > 15, 'Expected visible dark ink inside auto-placed compass');

  // Verify --no-border actually suppressed zebra border bars in [pad=4.8, inner=8.0] vs bordered control
  const borderedPng = path.join(dir, 't3-04-bordered.png');
  const resBordered = runCli([
    'render', specPath, '-o', borderedPng, '--ppm', '4', '--auto-layout',
  ]);
  assert.equal(resBordered.status, 0, `T3-04 bordered control failed: ${resBordered.stderr}`);
  const borderedImg = await decodePngPixels(borderedPng);

  const topBand = { x: 12, y: 4.8, w: 256, h: 3.2 };
  const botBand = { x: 12, y: 172.0, w: 256, h: 3.2 };
  const noBorderTop = countInkInBBox(noBorderImg, topBand, 4);
  const borderedTop = countInkInBBox(borderedImg, topBand, 4);
  const noBorderBot = countInkInBBox(noBorderImg, botBand, 4);
  const borderedBot = countInkInBBox(borderedImg, botBand, 4);

  assert.ok(
    borderedTop.darkRatio > 0.20 && borderedBot.darkRatio > 0.20,
    `Expected bordered render to draw dark zebra border bars (top=${borderedTop.darkRatio.toFixed(3)}, bot=${borderedBot.darkRatio.toFixed(3)})`
  );
  assert.ok(
    noBorderTop.darkRatio < 0.08 && noBorderBot.darkRatio < 0.08,
    `Expected --no-border to suppress zebra border dark ink (top=${noBorderTop.darkRatio.toFixed(3)}, bot=${noBorderBot.darkRatio.toFixed(3)})`
  );
  assert.ok(
    noBorderTop.darkInkCount < borderedTop.darkInkCount * 0.25 &&
      noBorderBot.darkInkCount < borderedBot.darkInkCount * 0.25,
    'Expected --no-border strip ink to be far lower than bordered control'
  );
});

test('T3-05: CJK + Latin bilingual labels + curved path sea label + angled region label + CJK cartouche', async (t) => {
  const dir = withTempDir(t, 'e2e-t3-05-');
  const specPath = writeSpecFile(dir, 'cjk-combo.json', {
    schemaVersion: 1,
    meta: { id: 't3-05', lang: 'zh', seed: 't3-05-seed' },
    canvas: { w: 260, h: 170 },
    geo: { fit: { target: 'Japan' }, focus: ['Japan'], waterlines: true },
    cartouche: {
      x: 12,
      y: 12,
      w: 76,
      h: 38,
      country: '日本列岛',
      subtitle: 'Japan Archipelago',
      flag: 'JPN',
      capital: '东京 Tokyo',
    },
    labels: [
      { id: 'tokyo-bi', text: '東京', subtext: 'Tokyo', lon: 139.69, lat: 35.69, size: 3.2 },
      { id: 'kyoto-bi', text: '京都', subtext: 'Kyoto', lon: 135.76, lat: 35.01, size: 2.8 },
      {
        id: 'sea-curved',
        kind: 'sea',
        text: '日本海 SEA OF JAPAN',
        path: [[70, 58], [95, 50], [125, 48], [150, 55]],
        size: 3.2,
      },
      {
        id: 'reg-angled',
        kind: 'region',
        text: '本州 HONSHU',
        x: 155,
        y: 105,
        angle: -25,
        size: 2.8,
      },
    ],
  });
  const outPng = path.join(dir, 't3-05.png');
  const outDiag = path.join(dir, 't3-05.diag.json');

  const res = runCli(['render', specPath, '-o', outPng, '--ppm', '4', '--diagnostics', outDiag]);
  assert.equal(res.status, 0, `T3-05 CLI failed: ${res.stderr}`);
  const diag = JSON.parse(fs.readFileSync(outDiag, 'utf8'));
  assertDiagnosticsSchema(diag);

  const img = await decodePngPixels(outPng);
  const cartInk = countInkInBBox(img, { x: 12, y: 12, w: 76, h: 38 }, 4);
  assert.ok(cartInk.darkInkCount > 100, 'Expected visible CJK cartouche ink');
  const seaItem = diag.items.find((it) => it.id === 'sea-curved');
  assert.ok(seaItem, 'Expected sea-curved in diagnostics');
  const seaInk = countInkInBBox(img, seaItem, 4, { padMm: 1.5 });
  assert.ok(seaInk.nonBgCount > 25, 'Expected visible curved sea label ink');

  const tokyoItem = diag.items.find((it) => it.id === 'tokyo-bi');
  assert.ok(tokyoItem, 'Expected tokyo-bi bilingual label in diagnostics');
  const tokyoInk = countInkInBBox(img, tokyoItem, 4, { padMm: 1.5 });
  assert.ok(tokyoInk.darkInkCount > 15, 'Expected visible ink inside tokyo-bi bilingual label');

  const regItem = diag.items.find((it) => it.id === 'reg-angled');
  assert.ok(regItem, 'Expected reg-angled region label in diagnostics');
  const regInk = countInkInBBox(img, regItem, 4, { padMm: 1.5 });
  assert.ok(regInk.nonBgCount > 15, 'Expected visible ink inside reg-angled region label');
});

test('T3-06: Natural Earth admin-1 focus + neighboring provinces + mountains + routes in one spec', (t) => {
  const dir = withTempDir(t, 'e2e-t3-06-');
  const specPath = writeSpecFile(dir, 'admin1-routes.json', {
    schemaVersion: 1,
    meta: { id: 't3-06', seed: 't3-06-seed' },
    canvas: { w: 240, h: 160 },
    geo: {
      fit: { target: { country: 'China', admin1: 'Sichuan' } },
      focus: ['China'],
      admin1: { country: 'China', highlight: ['Sichuan'] },
    },
    layers: {
      mountains: { auto: true },
      rivers: { auto: true },
      routes: [
        { pts: [[104.06, 30.67], [105.0, 30.2], [106.55, 29.56]] },
      ],
    },
  });
  const outPng = path.join(dir, 't3-06.png');
  const outDiag = path.join(dir, 't3-06.diag.json');

  const res = runCli(['render', specPath, '-o', outPng, '--ppm', '4', '--diagnostics', outDiag]);
  assert.equal(res.status, 0, `T3-06 CLI failed: ${res.stderr}`);
  const ihdr = parsePngIhdr(outPng);
  assert.equal(ihdr.width, 960);
  assert.equal(ihdr.height, 640);
  const diag = JSON.parse(fs.readFileSync(outDiag, 'utf8'));
  assertDiagnosticsSchema(diag);
  assert.ok(diag.summary.landCoveragePct > 10, 'Expected substantial land coverage for Sichuan province map');
});
