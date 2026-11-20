'use strict';
const D = require('../engine/lib/draw');
const { PALETTE: C, at, part } = require('./mapPrimitives');

// --- NATURE ---
function tree(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  part(P, T([[-0.9, -4.5], [0.9, -4.5], [1.2, 0], [-1.2, 0]]), C.wood, { nib: 0.15 });
  const crown = T(D.curve([[-4.2, -5.0], [-4.8, -8.5], [-2.2, -11.4], [1.8, -11.6], [4.6, -8.8], [4.0, -5.0]]));
  part(P, crown, o.color || C.forest, { nib: 0.18, shade: T([[1, -12], [5.5, -12], [5.5, -4], [1, -4]]), hatch: 75 });
}

function sakura(P, cx, by, s = 1) {
  tree(P, cx, by, s, { color: C.sakura });
  const T = at(cx, by, s);
  for (const [px, py] of [[-5.6, -6.4], [5.8, -7.8], [4.6, -3.5]]) {
    part(P, T(D.ell(px, py, 0.7, 0.45, 0.5)), C.sakura, { nib: 0.08, passes: 1 });
  }
}

function pine(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  part(P, T([[-0.7, -3.2], [0.7, -3.2], [0.9, 0], [-0.9, 0]]), C.wood, { nib: 0.13 });
  for (const [y0, w, h] of [[-2.4, 4.4, 4.6], [-5.4, 3.6, 4.4], [-8.2, 2.7, 4.0]]) {
    part(P, T([[-w, y0], [0, y0 - h], [w, y0]]), o.color || C.forestDark, { nib: 0.16 });
  }
}

function bamboo(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  for (const [dx, h, tilt] of [[-3.2, 14, -0.06], [0, 17, 0.02], [3.0, 13, 0.08]]) {
    const x1 = dx + Math.sin(tilt) * h;
    P.ink(T([[dx, 0], [x1, -h]]), { nib: 0.42 * s, color: C.forestDark });
    for (let y = -3.5; y > -h + 1; y -= 3.5) {
      const xm = dx + Math.sin(tilt) * (-y);
      P.ink(T([[xm - 0.9, y], [xm + 0.9, y]]), { nib: 0.14, color: C.ink });
    }
    // Little bamboo leaves
    for (const [lx, ly, a] of [[x1 + 1.6, -h + 2.5, -0.5], [x1 - 1.6, -h + 4.5, 0.5], [x1 + 1.4, -h + 6.5, -0.3]]) {
      part(P, T(D.ell(lx, ly, 2.0, 0.5, a)), C.forest, { nib: 0.08, passes: 1 });
    }
  }
}

function mountain(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  const body = T(D.curve([[-16, 0], [-9, -5.5], [-4.2, -12.5], [4.2, -12.5], [9, -5.5], [16, 0]]));
  part(P, body, o.color || C.navy, {
    pressure: 0.65,
    shade: T([[2, -13], [17, -13], [17, 1], [2, 1]]),
    hatch: 65,
    nib: 0.24,
  });
  if (o.snow !== false) {
    const cap = T([[-4.2, -12.5], [4.2, -12.5], [6.4, -8.5], [3.5, -7.2], [1.2, -8.6], [-1.4, -7.0], [-4.0, -8.4], [-6.4, -8.5]]);
    part(P, cap, C.snow, { nib: 0.16, pressure: 0.4, passes: 1 });
  }
}

function onsen(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  // Rocks around hot spring
  part(P, T(D.ell(0, -3.5, 9.5, 4.2)), '#8bbdd1', { nib: 0.2, pressure: 0.65 });
  for (const [rx, ry, rw, rh] of [[-7.8, -4.5, 2.8, 2.0], [7.6, -4.0, 3.0, 2.2], [-3.8, -7.2, 3.2, 1.8], [3.5, -7.0, 2.6, 1.7]]) {
    part(P, T(D.ell(rx, ry, rw, rh)), C.slate, { nib: 0.16 });
  }
  // Rising hot steam
  for (const dx of [-3.2, 0, 3.2]) {
    P.curve(T([[dx, -5.5], [dx + 0.8, -8.5], [dx - 0.8, -11.5], [dx + 0.5, -14.2]]), { nib: 0.13, color: '#6b6469' });
  }
}

// --- LANDMARKS & ARCHITECTURE ---
function torii(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  part(P, T([[-5.4, -12], [-3.8, -12], [-4.2, 0], [-5.8, 0]]), C.vermilion, { nib: 0.18 });
  part(P, T([[3.8, -12], [5.4, -12], [5.8, 0], [4.2, 0]]), C.vermilion, { nib: 0.18 });
  part(P, T([[-7.6, -10.2], [7.6, -10.2], [7.6, -8.8], [-7.6, -8.8]]), C.vermilion, { nib: 0.16 });
  part(P, T([[-1.2, -12.4], [1.2, -12.4], [1.2, -9.6], [-1.2, -9.6]]), C.ink, { nib: 0.12 });
  const top = T(D.curve([[-9.4, -14.2], [-4, -13.2], [4, -13.2], [9.4, -14.2], [8.6, -12.0], [0, -11.6], [-8.6, -12.0]]));
  part(P, top, C.vermilion, { nib: 0.2 });
}

function pagoda(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  P.ink(T([[0, -18.5], [0, -22.5]]), { nib: 0.2 });
  const tiers = [
    { y: 0, bw: 5.5, rw: 8.6, h: 5.4 },
    { y: -5.4, bw: 4.4, rw: 7.2, h: 4.8 },
    { y: -10.2, bw: 3.4, rw: 5.8, h: 4.5 },
  ];
  for (const t of tiers) {
    part(P, T([[-t.bw, t.y - t.h], [t.bw, t.y - t.h], [t.bw, t.y], [-t.bw, t.y]]), o.wall || C.cream, { nib: 0.16 });
    const roof = T([[-t.rw, t.y - t.h + 0.6], [-t.bw * 0.9, t.y - t.h - 2.2], [t.bw * 0.9, t.y - t.h - 2.2], [t.rw, t.y - t.h + 0.6]]);
    part(P, roof, o.roof || C.navy, { nib: 0.18 });
  }
  part(P, T([[-3.6, -14.7], [0, -18.5], [3.6, -14.7]]), o.roof || C.navy, { nib: 0.18 });
}

function castle(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  // Sloped stone foundation
  part(P, T([[-10, -5], [10, -5], [12, 0], [-12, 0]]), C.slate, { nib: 0.2, shade: T([[2, -6], [13, -6], [13, 1], [2, 1]]), hatch: 75 });
  // Lower keep + roof
  part(P, T([[-7.5, -11], [7.5, -11], [7.5, -5], [-7.5, -5]]), C.paper, { nib: 0.18 });
  part(P, T([[-10.2, -10.5], [-7.2, -13.2], [7.2, -13.2], [10.2, -10.5]]), C.forestDark, { nib: 0.18 });
  // Upper keep + roof
  part(P, T([[-5.0, -17.5], [5.0, -17.5], [5.0, -13.2], [-5.0, -13.2]]), C.paper, { nib: 0.16 });
  part(P, T([[-7.4, -17.0], [0, -21.5], [7.4, -17.0]]), C.forestDark, { nib: 0.18 });
  // Golden shachihoko finials
  part(P, T(D.ell(-3.2, -21.4, 0.8, 1.1)), C.gold, { nib: 0.1 });
  part(P, T(D.ell(3.2, -21.4, 0.8, 1.1)), C.gold, { nib: 0.1 });
}

function tokyoTower(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  // Main Eiffel-like tapered legs
  const body = T([[-5.8, 0], [-2.0, -13], [-0.9, -24], [0.9, -24], [2.0, -13], [5.8, 0], [3.4, 0], [1.4, -5.5], [-1.4, -5.5], [-3.4, 0]]);
  part(P, body, C.vermilion, { nib: 0.18 });
  // White bands
  part(P, T([[-3.6, -7], [3.6, -7], [3.0, -10.2], [-3.0, -10.2]]), C.paper, { nib: 0.14 });
  part(P, T([[-1.6, -16], [1.6, -16], [1.2, -19], [-1.2, -19]]), C.paper, { nib: 0.14 });
  // Observation decks
  part(P, T(D.rrect(-3.2, -13.4, 3.2, -11.6, 0.4)), C.vermilion, { nib: 0.16 });
  part(P, T(D.rrect(-1.8, -20.5, 1.8, -19.0, 0.3)), C.vermilion, { nib: 0.14 });
  // Antenna spire
  P.ink(T([[0, -24], [0, -28.5]]), { nib: 0.18, color: C.vermilion });
}

function house(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  part(P, T([[-6, -6.5], [6, -6.5], [6, 0], [-6, 0]]), o.wall || C.cream, { nib: 0.18 });
  part(P, T([[-7.6, -6.2], [0, -11.4], [7.6, -6.2]]), o.roof || C.terracotta, { nib: 0.2 });
  part(P, T([[-1.6, -4.2], [1.6, -4.2], [1.6, 0], [-1.6, 0]]), C.wood, { nib: 0.14 });
  part(P, T([[2.8, -4.8], [4.8, -4.8], [4.8, -2.8], [2.8, -2.8]]), C.ocean, { nib: 0.12 });
}

function lighthouse(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  part(P, T([[-3.0, -13], [3.0, -13], [4.2, 0], [-4.2, 0]]), C.paper, { nib: 0.2 });
  part(P, T([[-3.5, -8.5], [3.5, -8.5], [3.8, -5.2], [-3.8, -5.2]]), C.vermilion, { nib: 0.14 });
  part(P, T([[-3.8, -14.2], [3.8, -14.2], [3.8, -12.8], [-3.8, -12.8]]), C.navy, { nib: 0.16 });
  part(P, T([[-2.2, -17.2], [2.2, -17.2], [2.2, -14.2], [-2.2, -14.2]]), C.gold, { nib: 0.16 });
  part(P, T([[-2.8, -17.2], [0, -20.0], [2.8, -17.2]]), C.vermilion, { nib: 0.16 });
  for (const a of [-0.35, 0, 0.35, Math.PI - 0.35, Math.PI, Math.PI + 0.35]) {
    P.ink(T([[Math.cos(a) * 4.2, -15.6 + Math.sin(a) * 4.2], [Math.cos(a) * 7.8, -15.6 + Math.sin(a) * 7.8]]), { nib: 0.13, color: C.ochre });
  }
}

// --- TRANSPORT ---
function shinkansen(P, cx, by, s = 1, a = 0) {
  const T = at(cx, by, s, a);
  // Sleek white bullet train nose + coach
  const train = T(D.curve([[-14, 0], [-14, -5.2], [6, -5.2], [11, -4.4], [15.5, -1.6], [15.0, 0]]));
  part(P, train, C.paper, { nib: 0.2, pressure: 0.4 });
  // Signature blue stripe
  part(P, T([[-13.8, -2.0], [13.5, -2.0], [14.4, -1.0], [-13.8, -1.0]]), C.navy, { nib: 0.12 });
  // Windows
  for (const wx of [-11, -7, -3, 1, 5]) {
    part(P, T(D.rrect(wx, -4.2, wx + 2.4, -2.6, 0.3)), C.oceanDeep, { nib: 0.1, passes: 1 });
  }
  // Track line
  P.ink(T([[-16, 0.6], [17, 0.6]]), { nib: 0.16, color: C.slate });
}

function sailboat(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  P.ink(T([[0, -3], [0, -15.5]]), { nib: 0.22 });
  part(P, T([[0.4, -14.8], [7.2, -5.2], [0.4, -5.2]]), o.sail || C.cream, { nib: 0.18 });
  part(P, T([[-0.5, -13.2], [-5.2, -5.5], [-0.5, -5.5]]), o.sail2 || C.ochre, { nib: 0.16 });
  part(P, T([[-8.2, -3.4], [8.2, -3.4], [5.8, 0], [-5.8, 0]]), C.terracotta, { nib: 0.2 });
  P.ink(T([[-9.5, 0.4], [9.5, 0.4]]), { nib: 0.14, color: '#6b93a8' });
}

// --- ANIMALS ---
function whale(P, cx, cy, s = 1) {
  const T = at(cx, cy, s);
  const body = T(D.curve([[-10, 0], [-8, -5.5], [-1, -6.8], [6, -4.5], [10, -2.5], [13.5, -5.2], [11.5, -1.2], [14.2, 0.8], [9.5, 0.2], [4, 2.2], [-5, 2.0]]));
  part(P, body, C.navy, { nib: 0.2, pressure: 0.72 });
  P.dot(...T([[-5.8, -1.4]])[0], 0.5 * s, C.paper);
  P.curve(T([[-4.5, -6.5], [-5.2, -10.5], [-7.6, -11.4]]), { nib: 0.14, color: '#6b93a8' });
  P.curve(T([[-4.0, -6.5], [-3.2, -10.5], [-0.8, -11.4]]), { nib: 0.14, color: '#6b93a8' });
}

function shibaInu(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  // Legs
  for (const lx of [-3.8, -1.8, 2.2, 4.2]) {
    part(P, T([[lx - 0.7, -3.8], [lx + 0.7, -3.8], [lx + 0.6, 0], [lx - 0.6, 0]]), C.ochre, { nib: 0.14 });
  }
  // Curled tail
  part(P, T(D.ell(6.0, -6.6, 1.8, 1.8)), C.ochre, { nib: 0.16 });
  // Body
  part(P, T(D.ell(0.5, -4.8, 5.2, 2.7)), C.ochre, { nib: 0.18 });
  // Head + pointy ears
  part(P, T([[-6.2, -9.2], [-5.2, -12.4], [-3.8, -9.4]]), C.ochre, { nib: 0.14 });
  part(P, T([[-3.4, -9.4], [-2.2, -12.4], [-1.4, -9.2]]), C.ochre, { nib: 0.14 });
  part(P, T(D.ell(-3.8, -7.8, 3.0, 2.6)), C.ochre, { nib: 0.18 });
  part(P, T(D.ell(-4.4, -6.8, 1.9, 1.2)), C.paper, { nib: 0.1, passes: 1 });
  P.dot(...T([[-5.6, -7.0]])[0], 0.45 * s, C.ink);
  P.dot(...T([[-4.5, -8.2]])[0], 0.35 * s, C.ink);
}

function deer(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  // Slender legs
  for (const lx of [-3.6, -2.0, 2.4, 3.8]) {
    P.ink(T([[lx, -5.2], [lx, 0]]), { nib: 0.22 * s, color: C.brown });
  }
  // Body with white spots
  part(P, T(D.ell(0, -6.2, 5.0, 2.4)), C.terracotta, { nib: 0.16 });
  for (const [sx, sy] of [[-1.5, -6.8], [0.8, -6.2], [2.4, -6.8]]) {
    part(P, T(D.ell(sx, sy, 0.55, 0.45)), C.paper, { nib: 0.06, passes: 1 });
  }
  // Neck & head
  part(P, T([[-4.5, -6.5], [-5.8, -11.5], [-3.6, -11.5], [-2.2, -6.5]]), C.terracotta, { nib: 0.15 });
  part(P, T(D.ell(-5.5, -11.8, 2.2, 1.4, -0.2)), C.terracotta, { nib: 0.16 });
  // Antlers
  P.ink(T([[-4.6, -13], [-3.8, -16.2], [-2.2, -17.2]]), { nib: 0.13, color: C.brown });
  P.ink(T([[-3.8, -14.8], [-5.2, -16.2]]), { nib: 0.13, color: C.brown });
  P.dot(...T([[-6.2, -12.0]])[0], 0.35 * s, C.ink);
}

function crane(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  // Long thin legs
  P.ink(T([[-0.8, -6.5], [-1.2, 0]]), { nib: 0.16, color: C.ink });
  P.ink(T([[0.8, -6.5], [1.4, 0]]), { nib: 0.16, color: C.ink });
  // White body + black tail feathers
  part(P, T(D.ell(0, -8.2, 4.4, 2.5, -0.15)), C.paper, { nib: 0.16, pressure: 0.4 });
  part(P, T([[2.6, -8.5], [6.4, -6.5], [4.8, -5.2], [1.8, -6.8]]), C.ink, { nib: 0.14 });
  // Curved neck + head + red crown + beak
  P.curve(T([[-3.4, -8.8], [-4.8, -12.5], [-3.8, -15.4]]), { nib: 0.42 * s, color: C.paper });
  P.curve(T([[-3.4, -8.8], [-4.8, -12.5], [-3.8, -15.4]]), { nib: 0.16, color: C.ink });
  part(P, T(D.ell(-3.8, -15.6, 1.2, 1.0)), C.paper, { nib: 0.14 });
  part(P, T(D.ell(-3.6, -16.4, 0.8, 0.45)), C.crimson, { nib: 0.08 });
  P.ink(T([[-4.8, -15.6], [-7.6, -15.2]]), { nib: 0.16, color: C.ochre });
}

function koi(P, cx, cy, s = 1, a = 0) {
  const T = at(cx, cy, s, a);
  const body = T(D.curve([[-6.5, 0], [-3.5, -2.5], [2, -2.2], [6.5, 0], [9.2, -2.4], [8.2, 0], [9.2, 2.4], [6.5, 0], [2, 2.2], [-3.5, 2.5]]));
  part(P, body, C.paper, { nib: 0.16, pressure: 0.4 });
  part(P, T(D.ell(-2.2, -0.5, 2.0, 1.4)), C.vermilion, { nib: 0.08, passes: 1 });
  part(P, T(D.ell(2.5, 0.4, 1.6, 1.1)), C.orange, { nib: 0.08, passes: 1 });
  P.dot(...T([[-4.6, -0.5]])[0], 0.35 * s, C.ink);
}

// --- FOODS & CULTURAL OBJECTS ---
function foodBowl(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  part(P, T([[-4, -1.5], [4, -1.5], [3.4, 0], [-3.4, 0]]), C.paper, { nib: 0.14 });
  part(P, T(D.curve([[-8.8, -7.8], [-7.8, -3.2], [-4.4, -1.5], [4.4, -1.5], [7.8, -3.2], [8.8, -7.8]])), o.bowlColor || C.vermilion, { nib: 0.2 });
  part(P, T(D.ell(0, -7.8, 8.6, 2.2)), o.soupColor || C.ochre, { nib: 0.16 });
  part(P, T(D.ell(-3, -8.2, 2.2, 1.3)), C.paper, { nib: 0.11 });
  part(P, T(D.ell(-3, -8.2, 1.0, 0.7)), C.gold, { nib: 0.09, passes: 1 });
  part(P, T(D.ell(2.6, -8.0, 2.6, 1.2)), C.brown, { nib: 0.11 });
  P.ink(T([[-7.5, -10.8], [9.5, -8.6]]), { nib: 0.18, color: C.wood });
  P.ink(T([[-7.2, -12.0], [9.6, -9.4]]), { nib: 0.18, color: C.wood });
}

function sushi(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  part(P, T(D.rrect(-5.2, -4.4, 5.2, 0, 1.8)), C.paper, { nib: 0.16, pressure: 0.4 });
  part(P, T(D.curve([[-6.2, -3.8], [-4.5, -6.8], [0, -7.4], [4.5, -6.8], [6.2, -3.8], [0, -3.2]])), C.vermilion, { nib: 0.16 });
  part(P, T([[-1.6, -7.2], [1.6, -7.2], [1.6, 0.2], [-1.6, 0.2]]), C.ink, { nib: 0.12 });
}

function onigiri(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  const tri = T(D.curve([[-5.4, 0], [-4.8, -3.5], [0, -9.2], [4.8, -3.5], [5.4, 0]]));
  part(P, tri, C.paper, { nib: 0.18, pressure: 0.35 });
  part(P, T([[-2.6, -3.4], [2.6, -3.4], [2.8, 0.1], [-2.8, 0.1]]), C.ink, { nib: 0.14 });
}

function dango(P, cx, by, s = 1) {
  const T = at(cx, by, s, -0.35);
  P.ink(T([[0, 2], [0, -13]]), { nib: 0.18, color: C.wood });
  part(P, T(D.ell(0, -3.2, 2.2, 2.0)), C.matcha, { nib: 0.14 });
  part(P, T(D.ell(0, -6.8, 2.2, 2.0)), C.paper, { nib: 0.14, pressure: 0.4 });
  part(P, T(D.ell(0, -10.4, 2.2, 2.0)), C.sakura, { nib: 0.14 });
}

function matcha(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  part(P, T([[-3.5, -1.2], [3.5, -1.2], [3.0, 0], [-3.0, 0]]), C.ink, { nib: 0.14 });
  part(P, T(D.curve([[-6.2, -6.8], [-5.8, -2.5], [-3.6, -1.2], [3.6, -1.2], [5.8, -2.5], [6.2, -6.8]])), '#4f4844', { nib: 0.18 });
  part(P, T(D.ell(0, -6.8, 6.0, 1.6)), C.matcha, { nib: 0.14 });
  P.curve(T([[-1.2, -8.5], [-0.4, -10.8], [-1.4, -13.0]]), { nib: 0.11, color: '#7a7378' });
  P.curve(T([[1.4, -8.5], [2.2, -10.8], [1.2, -13.0]]), { nib: 0.11, color: '#7a7378' });
}

function daruma(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  part(P, T(D.ell(0, -5.5, 5.2, 5.6)), C.crimson, { nib: 0.2 });
  part(P, T(D.ell(0, -6.8, 3.2, 2.2)), C.cream, { nib: 0.14 });
  // Bold eyebrows & eyes
  P.ink(T([[-2.4, -8.0], [-0.8, -7.5]]), { nib: 0.22 });
  P.ink(T([[0.8, -7.5], [2.4, -8.0]]), { nib: 0.22 });
  P.dot(...T([[-1.4, -6.6]])[0], 0.55 * s, C.ink);
  part(P, T(D.ell(1.4, -6.6, 0.7, 0.7)), C.paper, { nib: 0.12 });
  // Gold belly stripes
  P.ink(T([[-2.2, -2.2], [2.2, -2.2]]), { nib: 0.16, color: C.gold });
}

function koinobori(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  P.ink(T([[0, 0], [0, -21]]), { nib: 0.24, color: C.wood });
  part(P, T(D.ell(0, -21.6, 0.9, 0.9)), C.gold, { nib: 0.12 });
  for (const [yy, len, col] of [[-18.5, 11, C.navy], [-14.0, 9.2, C.vermilion], [-10.0, 7.4, C.matcha]]) {
    const fish = T([[0.6, yy], [len, yy - 1.4], [len + 2.2, yy - 2.6], [len + 1.2, yy], [len + 2.2, yy + 2.2], [len, yy + 1.2], [0.6, yy + 1.8]]);
    part(P, fish, col, { nib: 0.14 });
    P.dot(...T([[2.4, yy + 0.5]])[0], 0.35 * s, C.paper);
  }
}

function origamiCrane(P, cx, cy, s = 1) {
  const T = at(cx, cy, s);
  part(P, T([[-6.5, -3.5], [0, 0.5], [6.5, -3.5], [2.2, -1.0], [0, -4.5], [-2.2, -1.0]]), C.sakura, { nib: 0.15 });
  part(P, T([[-2.2, -1.0], [-5.2, -5.8], [-6.6, -4.8], [-3.0, -0.5]]), C.sakura, { nib: 0.14 });
  part(P, T([[2.2, -1.0], [5.8, -5.5], [3.8, -0.2]]), C.sakura, { nib: 0.14 });
}

function sumoRing(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  // Straw dohyo ring
  part(P, T(D.ell(0, -2.5, 13.5, 4.2)), '#e6d3a7', { nib: 0.22 });
  P.outline([T(D.ell(0, -2.5, 11.2, 3.3))], { nib: 0.14, color: C.wood });
  // Two stylized sumo wrestlers facing off
  for (const sd of [-1, 1]) {
    const wx = sd * 4.8;
    // Legs
    part(P, T([[wx - 2.0, -5], [wx - 0.8, -5], [wx - 1.0, -2.0], [wx - 2.4, -2.0]]), '#f5dcc4', { nib: 0.14 });
    part(P, T([[wx + 0.8, -5], [wx + 2.0, -5], [wx + 2.4, -2.0], [wx + 1.0, -2.0]]), '#f5dcc4', { nib: 0.14 });
    // Big round sumo torso + mawashi belt
    part(P, T(D.ell(wx, -7.8, 3.6, 3.8)), '#f5dcc4', { nib: 0.18 });
    part(P, T([[wx - 3.2, -6.2], [wx + 3.2, -6.2], [wx + 2.8, -4.6], [wx - 2.8, -4.6]]), sd < 0 ? C.navy : C.crimson, { nib: 0.14 });
    // Head + topknot (chonmage)
    part(P, T(D.ell(wx, -12.2, 1.9, 1.9)), '#f5dcc4', { nib: 0.16 });
    part(P, T(D.ell(wx, -14.3, 0.8, 0.6)), C.ink, { nib: 0.12 });
    // Arms reaching forward
    P.ink(T([[wx - sd * 2.4, -8.8], [wx - sd * 4.2, -8.2]]), { nib: 0.35 * s, color: '#f5dcc4' });
  }
}

module.exports = {
  tree,
  sakura,
  pine,
  bamboo,
  mountain,
  onsen,
  torii,
  pagoda,
  castle,
  tokyoTower,
  house,
  lighthouse,
  shinkansen,
  sailboat,
  whale,
  shibaInu,
  deer,
  crane,
  koi,
  foodBowl,
  sushi,
  onigiri,
  dango,
  matcha,
  daruma,
  koinobori,
  origamiCrane,
  sumoRing,
};
