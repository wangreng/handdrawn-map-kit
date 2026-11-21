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
  computePatchDiffRatio,
  writeSpecFile,
  assertDiagnosticsSchema,
  requireModule,
} = require('./helpers');

// ============================================================================
// Group 1: Spec & CLI Errors — 7 tests
// ============================================================================

test('T2-SPEC-01: malformed JSON spec file exits 1 with informative stderr', (t) => {
  const dir = withTempDir(t, 'e2e-t2-badjson-');
  const badPath = writeSpecFile(dir, 'broken.json', '{ "schemaVersion": 1, "meta": ');
  const res = runCli(['render', badPath, '-o', path.join(dir, 'out.png'), '--fast']);
  assert.equal(res.status, 1, 'Expected exit code 1 for malformed JSON');
  assert.doesNotMatch(
    res.stderr,
    /Cannot find module|MODULE_NOT_FOUND/i,
    `CLI must not fail with missing module: ${res.stderr}`
  );
  assert.match(
    res.stderr,
    /json|parse|syntax|unexpected|invalid|spec/i,
    `Expected JSON parse error on stderr, got: ${res.stderr}`
  );
});

test('T2-SPEC-02: malformed YAML spec file exits 1 with informative stderr', (t) => {
  const dir = withTempDir(t, 'e2e-t2-badyaml-');
  const badPath = writeSpecFile(dir, 'broken.yaml', 'schemaVersion: 1\ngeo:\n  fit: [unterminated\n');
  const res = runCli(['render', badPath, '-o', path.join(dir, 'out.png'), '--fast']);
  assert.equal(res.status, 1, 'Expected exit code 1 for malformed YAML');
  assert.doesNotMatch(
    res.stderr,
    /Cannot find module|MODULE_NOT_FOUND|SyntaxError/i,
    `CLI must not crash with module/JS syntax error: ${res.stderr}`
  );
  assert.match(
    res.stderr,
    /yaml|parse|unexpected|end of|invalid|spec/i,
    `Expected YAML parse error on stderr, got: ${res.stderr}`
  );
});

test('T2-SPEC-03: missing or unsupported schemaVersion fails validateSpec cleanly', () => {
  const { validateSpec } = requireModule('src/spec.js');

  const missing = validateSpec({ meta: { id: 'no-ver' }, geo: { fit: { target: 'Japan' } } });
  assert.equal(missing.ok, false, 'Expected missing schemaVersion to fail validation');
  assert.ok(missing.errors.length >= 1);

  const future = validateSpec({ schemaVersion: 99, geo: { fit: { target: 'Japan' } } });
  assert.equal(future.ok, false, 'Expected unsupported schemaVersion: 99 to fail validation');
  assert.ok(future.errors.length >= 1);
});

test('T2-CLI-01: nonexistent spec path exits 1 with informative stderr', (t) => {
  const dir = withTempDir(t, 'e2e-t2-nofile-');
  const res = runCli(['render', path.join(dir, 'does-not-exist.yaml'), '-o', path.join(dir, 'out.png')]);
  assert.equal(res.status, 1, 'Expected exit code 1 for missing spec file');
  assert.doesNotMatch(
    res.stderr,
    /Cannot find module|MODULE_NOT_FOUND|SyntaxError/i,
    `CLI must not crash with module/JS syntax error: ${res.stderr}`
  );
  assert.match(
    res.stderr,
    /enoent|not found|no such file|exist|cannot read|does-not-exist/i,
    `Expected missing-file error on stderr, got: ${res.stderr}`
  );
});

test('T2-CLI-02: unknown CLI subcommand exits 1 with usage/error message', () => {
  const res = runCli(['frobnicate', '--json']);
  assert.equal(res.status, 1, 'Expected exit code 1 for unknown CLI command');
  const combined = `${res.stderr}\n${res.stdout}`;
  assert.doesNotMatch(
    combined,
    /Cannot find module|MODULE_NOT_FOUND|SyntaxError/i,
    `CLI must not crash with module/JS syntax error: ${combined}`
  );
  assert.match(
    combined,
    /unknown|invalid|usage|frobnicate|command/i,
    `Expected usage/unknown-command message, got: ${combined}`
  );
});

test('T2-CLI-03: unknown country in spec exits 1 gracefully', (t) => {
  const dir = withTempDir(t, 'e2e-t2-atlantis-');
  const specPath = writeSpecFile(dir, 'atlantis.json', {
    schemaVersion: 1,
    meta: { id: 'atlantis' },
    canvas: { w: 160, h: 100 },
    geo: { fit: { target: 'Atlantis' }, focus: ['Atlantis'] },
  });
  const res = runCli(['render', specPath, '-o', path.join(dir, 'out.png'), '--ppm', '4']);
  assert.equal(res.status, 1, 'Expected exit code 1 for unknown country Atlantis');
  assert.doesNotMatch(
    res.stderr,
    /Cannot find module|MODULE_NOT_FOUND|SyntaxError/i,
    `CLI must not crash with module/JS syntax error: ${res.stderr}`
  );
  assert.ok(/atlantis|unknown|country/i.test(res.stderr), `Expected descriptive stderr, got: ${res.stderr}`);
});

test('T2-CLI-04: unwritable output directory path exits 1 with clean I/O error', (t) => {
  const dir = withTempDir(t, 'e2e-t2-unwritable-');
  const specPath = writeSpecFile(dir, 'valid.json', {
    schemaVersion: 1,
    meta: { id: 'io-err', seed: 'io-1' },
    canvas: { w: 120, h: 80 },
    geo: { fit: { target: 'Japan' }, focus: ['Japan'] },
  });
  // Use a regular file as the parent path so writing fails with ENOTDIR/EEXIST even under root.
  const fileBlocker = path.join(dir, 'not-a-directory');
  fs.writeFileSync(fileBlocker, 'blocker', 'utf8');
  const badOutPath = path.join(fileBlocker, 'out.png');

  const res = runCli(['render', specPath, '-o', badOutPath, '--ppm', '4']);
  assert.equal(res.status, 1, 'Expected exit code 1 when output directory is not writable');
  assert.doesNotMatch(
    res.stderr,
    /Cannot find module|MODULE_NOT_FOUND|SyntaxError/i,
    `CLI must not crash with module/JS syntax error: ${res.stderr}`
  );
  assert.match(
    res.stderr,
    /enotdir|eexist|eacces|eperm|not a directory|cannot|failed|error/i,
    `Expected I/O error on stderr, got: ${res.stderr}`
  );
});

// ============================================================================
// Group 2: Memory Cap Boundaries — 2 tests
// ============================================================================

test('T2-MEM-01: --ppm exceeding 18.5e6 pixel cap is rejected gracefully with exit 1', (t) => {
  const dir = withTempDir(t, 'e2e-t2-memcap-');
  const specPath = writeSpecFile(dir, 'huge.json', {
    schemaVersion: 1,
    meta: { id: 'memcap-test' },
    canvas: { w: 300, h: 200 },
    geo: { fit: { target: 'Japan' }, focus: ['Japan'] },
  });
  // 300 * 20 * 200 * 20 = 24,000,000 > 18,500,000
  const res = runCli(['render', specPath, '-o', path.join(dir, 'huge.png'), '--ppm', '20']);
  assert.equal(res.status, 1, 'Expected exit code 1 when W * H > 18.5e6');
  assert.doesNotMatch(
    res.stderr,
    /Cannot find module|MODULE_NOT_FOUND|SyntaxError/i,
    `CLI must not crash with module/JS syntax error: ${res.stderr}`
  );
  assert.match(
    res.stderr,
    /pixel|memory|cap|limit|18\.5|ppm|too large|exceed/i,
    `Expected memory cap error message on stderr, got: ${res.stderr}`
  );
});

test('T2-MEM-02: ppm safely below 18.5e6 cap succeeds with exact IHDR dimensions', (t) => {
  const dir = withTempDir(t, 'e2e-t2-memok-');
  const specPath = writeSpecFile(dir, 'ok.json', {
    schemaVersion: 1,
    meta: { id: 'memok-test', seed: 'memok-1' },
    canvas: { w: 150, h: 100 },
    geo: { fit: { target: 'Japan' }, focus: ['Japan'] },
  });
  const outPng = path.join(dir, 'ok.png');
  const res = runCli(['render', specPath, '-o', outPng, '--ppm', '4']);
  assert.equal(res.status, 0, `Expected exit 0, got ${res.status}: ${res.stderr}`);
  const ihdr = parsePngIhdr(outPng);
  assert.equal(ihdr.width, 600);
  assert.equal(ihdr.height, 400);
});

// ============================================================================
// Group 3: Geo Boundaries — 5 tests
// ============================================================================

test('T2-GEO-01: unknown country throws in getCountry and returns null in findCountry', () => {
  const geo = requireModule('src/geo.js');
  assert.equal(geo.findCountry('Atlantis'), null);
  assert.throws(() => geo.getCountry('Atlantis'), /unknown country|atlantis/i);
});

test('T2-GEO-02: unknown admin-1 throws in getAdmin1 and returns null in findAdmin1', () => {
  const geo = requireModule('src/geo.js');
  assert.equal(geo.findAdmin1('Narnia', { country: 'China' }), null);
  assert.throws(() => geo.getAdmin1('Narnia', { country: 'China' }), /unknown|narnia|admin/i);
});

test('T2-GEO-03: open-ocean tiny bbox returns empty arrays cleanly without throwing', () => {
  const geo = requireModule('src/geo.js');
  const oceanBBox = [-150.0, -40.0, -149.9, -39.9];
  assert.deepEqual(geo.admin1InBBox(oceanBBox), []);
  assert.deepEqual(geo.riversInBBox(oceanBBox), []);
  assert.deepEqual(geo.lakesInBBox(oceanBBox), []);
  assert.deepEqual(geo.placesInBBox(oceanBBox), []);
  assert.deepEqual(geo.peaksInBBox(oceanBBox), []);
});

test('T2-GEO-04: extreme world bbox and antimeridian bbox return valid non-NaN results', () => {
  const geo = requireModule('src/geo.js');
  const world = geo.placesInBBox([-180, -85, 180, 85]);
  assert.ok(Array.isArray(world) && world.length >= 50, 'Expected global populated places');
  for (const p of world.slice(0, 20)) {
    assert.ok(Number.isFinite(p.lon) && Number.isFinite(p.lat), 'All place coords must be finite');
  }
  const anti = geo.countriesInBBox([170, -25, 190, -10]);
  assert.ok(Array.isArray(anti) && anti.length >= 1, 'Expected antimeridian countries (e.g. Fiji)');
});

test('T2-GEO-05: Unicode and diacritic normalization resolves accented and CJK place names', () => {
  const geo = requireModule('src/geo.js');
  assert.equal(typeof geo.findPlace, 'function', 'geo.findPlace must be exported');

  const saoPauloAccented = geo.findPlace('São Paulo');
  const saoPauloAscii = geo.findPlace('Sao Paulo');
  const chengdu = geo.findPlace('成都');

  assert.ok(saoPauloAccented, 'Expected accented "São Paulo" to resolve');
  assert.ok(saoPauloAscii, 'Expected ASCII "Sao Paulo" to resolve via diacritic normalization');
  assert.ok(
    Math.abs(saoPauloAccented.lon - saoPauloAscii.lon) < 1e-4 &&
      Math.abs(saoPauloAccented.lat - saoPauloAscii.lat) < 1e-4,
    'Expected "São Paulo" and "Sao Paulo" to resolve to the same place'
  );
  assert.ok(chengdu, 'Expected CJK "成都" to resolve via Unicode norm()');
});

// ============================================================================
// Group 4: SVG Boundaries — 5 tests
// ============================================================================

test('T2-SVG-01: malformed SVG string does not produce NaN bbox or uncaught crash', () => {
  const { measureSvg } = requireModule('src/svgDraw.js');
  assert.equal(typeof measureSvg, 'function', 'measureSvg must be exported as a function');
  let bbox = null;
  try {
    bbox = measureSvg('<svg><path d="M not-a-number ???"', 50, 50, { width: 20 });
  } catch (err) {
    assert.ok(err instanceof Error, 'Malformed SVG may throw a clean Error');
    assert.ok(
      !(err instanceof TypeError) && !(err instanceof ReferenceError),
      `Malformed SVG must not crash with ${err.name}: ${err.message}`
    );
    return;
  }
  assertValidBBox(bbox, 'malformed svg fallback bbox');
});

test('T2-SVG-02: empty <svg></svg> returns finite zero-size BBox without crashing', () => {
  const { createMap } = requireModule('src/index.js');
  const { drawSvg, measureSvg } = requireModule('src/svgDraw.js');
  const mBox = measureSvg('<svg></svg>', 40, 40, { width: 20 });
  assertValidBBox(mBox, 'measureSvg(empty)');
  assert.equal(mBox.w, 0);
  assert.equal(mBox.h, 0);

  const map = createMap({ w: 80, h: 60, ppm: 4, seed: 'svg-empty', ocean: false, border: false });
  const dBox = drawSvg(map.P, '<svg></svg>', 40, 40, { width: 20 });
  assertValidBBox(dBox, 'drawSvg(empty)');
});

test('T2-SVG-03: zero-size viewBox="0 0 0 0" produces finite BBox without NaN', () => {
  const { measureSvg } = requireModule('src/svgDraw.js');
  const bbox = measureSvg('<svg viewBox="0 0 0 0"><rect x="0" y="0" width="0" height="0"/></svg>', 30, 30, { width: 15 });
  assertValidBBox(bbox, 'zero-size viewBox');
});

test('T2-SVG-04: compact SVG arc flags (0120 / 1010) parse cleanly to finite coordinates', () => {
  const { parsePathD } = requireModule('src/svgDraw.js');
  const subpaths = parsePathD('M 0 20 A 10 10 0 0120 20 a 5 5 0 1010 0 Z');
  assert.ok(Array.isArray(subpaths) && subpaths.length >= 1, 'Expected parsed arc subpath');
  const first = subpaths[0];
  const pts = Array.isArray(first) ? first : first.pts || first.points;
  assert.ok(Array.isArray(pts) && pts.length >= 4, 'Expected arc sampled into points');
  for (const [x, y] of pts) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), 'Compact arc must produce finite coordinates');
  }
});

test('T2-SVG-05: deeply nested <g transform> stack renders valid finite BBox', async (t) => {
  const { createMap } = requireModule('src/index.js');
  const { drawSvg } = requireModule('src/svgDraw.js');
  const dir = withTempDir(t, 'e2e-t2-svg-nested-');
  const outPng = path.join(dir, 'nested.png');
  const ppm = 5;
  const map = createMap({ w: 100, h: 80, ppm, seed: 'svg-nested', ocean: false, border: false });

  const svg = [
    '<svg viewBox="0 0 40 40">',
    '  <g transform="translate(5, 5)">',
    '    <g transform="scale(1.2)">',
    '      <g transform="rotate(15 10 10)">',
    '        <g transform="translate(2, 2)">',
    '          <rect x="2" y="2" width="14" height="14" fill="#c85a3a" stroke="#191512"/>',
    '        </g>',
    '      </g>',
    '    </g>',
    '  </g>',
    '</svg>',
  ].join('\n');

  const bbox = drawSvg(map.P, svg, 50, 40, { width: 22 });
  assertValidBBox(bbox, 'nested transform svg');
  await map.save(outPng);
  const img = await decodePngPixels(outPng);
  const ink = countInkInBBox(img, bbox, ppm, { padMm: 1 });
  assert.ok(ink.nonBgCount > 30, 'Expected visible ink from nested transformed SVG');
});

// ============================================================================
// Group 5: Typography & CJK Boundaries — 5 tests
// ============================================================================

test('T2-CJK-01: very long CJK cartouche title auto-scales cleanly inside cartouche width', async (t) => {
  const { createMap } = requireModule('src/index.js');
  const dir = withTempDir(t, 'e2e-t2-cjk-longtitle-');
  const outPng = path.join(dir, 'long-title.png');
  const ppm = 5;
  const map = createMap({ w: 140, h: 80, ppm, seed: 'cjk-long', border: false });

  map.cartouche(10, 10, 86, 44, {
    country: '中华人民共和国四川省历史文化与自然风光全景图',
    flag: 'CHN',
    capital: '成都',
  });
  await map.save(outPng);
  const img = await decodePngPixels(outPng);
  // Ensure ink exists inside cartouche and nothing overflowed far to the right outside [10, 96].
  const insideInk = countInkInBBox(img, { x: 10, y: 10, w: 86, h: 44 }, ppm);
  const rightMarginInk = countInkInBBox(img, { x: 102, y: 10, w: 30, h: 44 }, ppm);
  assert.ok(insideInk.darkInkCount > 100, 'Expected ink inside cartouche');
  assert.equal(rightMarginInk.darkInkCount, 0, 'Long CJK title must not spill outside cartouche right edge');
});

test('T2-CJK-02: drawInsetBox with long CJK title renders wider title strip than short title', async (t) => {
  const { createMap } = requireModule('src/index.js');
  const Lt = requireModule('engine/lib/letter.js');
  assert.equal(typeof Lt.measureBox, 'function', 'Lt.measureBox must be exported');

  const dir = withTempDir(t, 'e2e-t2-inset-cjk-');
  const ppm = 5;

  const shortW = Lt.measure('川西', 'serif-bold', 2.3);
  const longW = Lt.measure('四川省九寨沟黄龙风景区', 'serif-bold', 2.3);
  assert.ok(longW > shortW * 3, `Expected long CJK title (${longW}) >> short (${shortW})`);

  const renderInset = async (name, title) => {
    const map = createMap({ w: 110, h: 75, ppm, seed: 'inset-cjk', border: false });
    map.insetBox(10, 12, 80, 50, title);
    const outPng = path.join(dir, `${name}.png`);
    await map.save(outPng);
    return decodePngPixels(outPng);
  };

  const emptyImg = await renderInset('empty', '');
  const shortImg = await renderInset('short', '川西');
  const longImg = await renderInset('long', '四川省九寨沟黄龙风景区');

  // Strictly inside the insetBox inner hairline (x: 11.1..88.9, y: 13.1..60.9) so zero border ink enters.
  const fullStrip = { x: 12, y: 13.8, w: 76, h: 6.2 };
  const rightStrip = { x: 34, y: 13.8, w: 54, h: 6.2 };

  const emptyFullInk = countInkInBBox(emptyImg, fullStrip, ppm);
  assert.equal(emptyFullInk.darkInkCount, 0, 'Empty-title insetBox interior title strip must have 0 border ink');

  const shortFullInk = countInkInBBox(shortImg, fullStrip, ppm);
  const longFullInk = countInkInBBox(longImg, fullStrip, ppm);
  assert.ok(shortFullInk.darkInkCount > 15, 'Short CJK title must render visible ink in title strip');
  assert.ok(
    longFullInk.darkInkCount > shortFullInk.darkInkCount * 2,
    `Expected long CJK title ink (${longFullInk.darkInkCount}) > 2x short (${shortFullInk.darkInkCount})`
  );

  const shortRightInk = countInkInBBox(shortImg, rightStrip, ppm);
  const longRightInk = countInkInBBox(longImg, rightStrip, ppm);
  assert.equal(shortRightInk.darkInkCount, 0, 'Short title must not extend into right strip (x >= 34 mm)');
  assert.ok(longRightInk.darkInkCount > 30, 'Long CJK title must extend visibly into right strip (x >= 34 mm)');

  const rightDiff = computePatchDiffRatio(emptyImg, longImg, rightStrip, ppm);
  assert.ok(
    rightDiff.diffPixels > 100,
    `Expected long CJK title to visibly differ from empty-title insetBox in right strip (diffPixels=${rightDiff.diffPixels})`
  );
});

test('T2-CJK-03: empty and whitespace-only strings return zero-width finite BBox without crash', () => {
  const { createMap } = requireModule('src/index.js');
  const Lt = requireModule('engine/lib/letter.js');
  const map = createMap({ w: 80, h: 40, ppm: 4, seed: 'cjk-empty', ocean: false, border: false });

  for (const s of ['', '   ']) {
    const mBox = Lt.measureBox(s, { x: 20, y: 20, size: 4 });
    assertValidBBox(mBox, `measureBox("${s}")`);
    const wBox = Lt.write(map.P.S, s, 20, 20, { size: 4 });
    assertValidBBox(wBox, `write("${s}")`);
  }
});

test('T2-CJK-04: tiny 2-point curved path in writeAlongPath produces finite BBox without NaN', () => {
  const { createMap } = requireModule('src/index.js');
  const Lt = requireModule('engine/lib/letter.js');
  const map = createMap({ w: 100, h: 60, ppm: 4, seed: 'tiny-curve', ocean: false, border: false });

  const bbox = Lt.writeAlongPath(map.P.S, '长江', [[40, 30], [44, 30.5]], { size: 3.5 });
  assertValidBBox(bbox, 'tiny writeAlongPath');
});

test('T2-CJK-05: invalid font path in registerFont throws a clean Error', () => {
  const Lt = requireModule('engine/lib/letter.js');
  assert.equal(typeof Lt.registerFont, 'function', 'Lt.registerFont must be exported as a function');
  assert.throws(
    () => Lt.registerFont('NonExistentFont', '/tmp/definitely-missing-font-file-12345.ttf'),
    (err) => {
      assert.ok(err instanceof Error, 'Expected an Error instance');
      assert.ok(!(err instanceof TypeError), `Expected non-TypeError, got TypeError: ${err.message}`);
      assert.match(err.message, /enoent|not found|exist|font|file/i);
      return true;
    }
  );
});

// ============================================================================
// Group 6: Layout & Auto-Layout Boundaries — 5 tests
// ============================================================================

test('T2-LAY-01: out-of-bounds item detected with exact overflow values', () => {
  const { createLayout } = requireModule('src/layout.js');
  const layout = createLayout({ w: 300, h: 200, inner: 8 });
  // Safe frame is [8, 8, 292, 192]
  layout.register({ id: 'oob-tl', kind: 'label', x: 3, y: 5, w: 20, h: 10 });
  layout.register({ id: 'oob-br', kind: 'label', x: 280, y: 185, w: 20, h: 12 });

  const oob = layout.findOutOfBounds();
  assert.equal(oob.length, 2);

  const tl = oob.find((item) => item.id === 'oob-tl');
  assert.ok(tl, 'Expected oob-tl in findOutOfBounds');
  assert.ok(Math.abs(tl.overflow.left - 5) < 1e-6, `Expected left overflow 5, got ${tl.overflow.left}`);
  assert.ok(Math.abs(tl.overflow.top - 3) < 1e-6, `Expected top overflow 3, got ${tl.overflow.top}`);

  const br = oob.find((item) => item.id === 'oob-br');
  assert.ok(br, 'Expected oob-br in findOutOfBounds');
  assert.ok(Math.abs(br.overflow.right - 8) < 1e-6, `Expected right overflow 8, got ${br.overflow.right}`);
  assert.ok(Math.abs(br.overflow.bottom - 5) < 1e-6, `Expected bottom overflow 5, got ${br.overflow.bottom}`);
});

test('T2-LAY-02: exact touching edges (x1 === x0) are not counted as overlap', () => {
  const { createLayout } = requireModule('src/layout.js');
  const layout = createLayout({ w: 300, h: 200, inner: 8 });
  const a = layout.register({ id: 'left', kind: 'label', x: 40, y: 40, w: 20, h: 10 });
  const b = layout.register({ id: 'right', kind: 'label', x: 60, y: 40, w: 20, h: 10 });

  assert.equal(layout.overlaps(a, b, 0), null, 'Touching edges must not overlap when pad=0');
  assert.equal(layout.findOverlaps({ pad: 0 }).length, 0);
});

test('T2-LAY-03: fixed high-priority item stays unmoved while low-priority overlapping label nudges', async (t) => {
  const { renderSpec } = requireModule('src/spec.js');
  const dir = withTempDir(t, 'e2e-t2-lay-fixed-');
  const outPng = path.join(dir, 'fixed.png');

  const result = await renderSpec({
    schemaVersion: 1,
    meta: { id: 'fixed-priority', seed: 'fixed-1' },
    canvas: { w: 200, h: 140, ppm: 4 },
    geo: { fit: { target: 'Italy' }, focus: ['Italy'] },
    layout: { autoPlace: true, avoidOverlap: true, padding: 1.5 },
    labels: [
      { id: 'anchor-fixed', text: 'ROMA', x: 100, y: 70, size: 3.4, priority: 100, fixed: true },
      { id: 'movable-low', text: 'Ostia', x: 100, y: 70, size: 2.8, priority: 20, fixed: false },
    ],
  });
  await result.save(outPng);
  assertDiagnosticsSchema(result.diagnostics);
  assert.equal(result.diagnostics.overlaps.length, 0, 'Expected overlap resolved');

  const fixedItem = result.diagnostics.items.find((it) => it.id === 'anchor-fixed');
  const movedItem = result.diagnostics.items.find((it) => it.id === 'movable-low');
  assert.ok(fixedItem && movedItem, 'Expected both labels in diagnostics');
  const fixedCx = fixedItem.x + fixedItem.w / 2;
  const movedCx = movedItem.x + movedItem.w / 2;
  const fixedCy = fixedItem.y + fixedItem.h / 2;
  const movedCy = movedItem.y + movedItem.h / 2;
  assert.ok(Math.hypot(fixedCx - 100, fixedCy - 70) < 5, 'Fixed high-priority item should stay near (100, 70)');
  assert.ok(Math.hypot(movedCx - fixedCx, movedCy - fixedCy) > 2, 'Low-priority item should be nudged away');
});

test('T2-LAY-04: fully occupied canvas returns emptyRegions: [] cleanly', () => {
  const { createLayout } = requireModule('src/layout.js');
  const layout = createLayout({ w: 120, h: 80, inner: 8, gridStep: 4 });
  layout.register({ id: 'cover-all', kind: 'inset', x: 8, y: 8, w: 104, h: 64 });
  const empty = layout.findEmptyRegions({ terrain: 'any', minW: 12, minH: 12 });
  assert.deepEqual(empty, []);
});

test('T2-LAY-05: zero-size box in layout produces valid diagnostics without NaN', () => {
  const { createLayout } = requireModule('src/layout.js');
  const layout = createLayout({ w: 200, h: 140, inner: 8 });
  const box = layout.register({ id: 'zero', kind: 'marker', x: 50, y: 50, w: 0, h: 0 });
  assertValidBBox(box, 'zero-size layout box');
  const diag = layout.toDiagnostics({ ppm: 5 });
  assertDiagnosticsSchema(diag);
  assert.equal(diag.overlaps.length, 0);
});
