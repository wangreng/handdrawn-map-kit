'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProjection } = require('../src');

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('projection maps its origin to the page centre', () => {
  const proj = createProjection({ lon0: 137.6, lat0: 38.2, cx: 160, cy: 100, scale: 0.14, rotDeg: 26 });
  const [x, y] = proj(137.6, 38.2);
  near(x, 160);
  near(y, 100);
});

test('unrotated projection puts north up and east right', () => {
  const proj = createProjection({ lon0: 10, lat0: 50, cx: 0, cy: 0, scale: 1, rotDeg: 0 });
  const [nx, ny] = proj(10, 51);
  near(nx, 0);
  near(ny, -110.57);
  const [ex, ey] = proj(11, 50);
  assert.ok(ex > 0);
  near(ey, 0);
  near(proj.northAngle(10, 50), 0);
});

test('northAngle follows the page rotation', () => {
  const proj = createProjection({ rotDeg: 26 });
  near(proj.northAngle(137.6, 38.2), (26 * Math.PI) / 180);
});

test('pts projects a list of [lon, lat] pairs', () => {
  const proj = createProjection({ rotDeg: 12 });
  const list = [[130, 33], [141, 43]];
  assert.deepEqual(proj.pts(list), list.map(([lon, lat]) => proj(lon, lat)));
});
