'use strict';
const D = require('../engine/lib/draw');
const { person } = require('../engine/lib/people');
const { PALETTE: C, at, part } = require('./mapPrimitives');

const TILE = '#4d5964';
const STONE = '#c9c2b4';

// Exact local bounding boxes at scale s = 1 (in mm) for all 65 elements
const ELEMENT_BOUNDS = {
  // Existing 43 elements
  tree: { x0: -5.2, y0: -12.0, x1: 5.0, y1: 0.2 },
  sakura: { x0: -6.4, y0: -12.0, x1: 6.6, y1: 0.2 },
  pine: { x0: -4.6, y0: -12.4, x1: 4.6, y1: 0.2 },
  bamboo: { x0: -7.6, y0: -17.3, x1: 7.6, y1: 0.2 },
  mountain: { x0: -16.4, y0: -13.6, x1: 16.4, y1: 1.2 },
  onsen: { x0: -10.8, y0: -14.4, x1: 10.8, y1: 0.9 },
  torii: { x0: -9.8, y0: -14.6, x1: 9.8, y1: 0.2 },
  pagoda: { x0: -8.8, y0: -22.7, x1: 8.8, y1: 0.2 },
  castle: { x0: -12.2, y0: -22.7, x1: 12.2, y1: 0.2 },
  tokyoTower: { x0: -6.0, y0: -28.7, x1: 6.0, y1: 0.2 },
  house: { x0: -7.8, y0: -11.6, x1: 7.8, y1: 0.2 },
  lighthouse: { x0: -8.0, y0: -20.2, x1: 8.0, y1: 0.2 },
  shinkansen: { x0: -16.2, y0: -5.8, x1: 17.2, y1: 0.8 },
  sailboat: { x0: -9.7, y0: -15.7, x1: 9.7, y1: 0.6 },
  whale: { x0: -10.5, y0: -11.6, x1: 14.6, y1: 2.8 },
  shibaInu: { x0: -7.0, y0: -12.6, x1: 8.0, y1: 0.2 },
  deer: { x0: -7.9, y0: -17.4, x1: 5.2, y1: 0.2 },
  crane: { x0: -7.8, y0: -17.0, x1: 6.6, y1: 0.2 },
  koi: { x0: -6.9, y0: -2.9, x1: 9.5, y1: 2.9 },
  foodBowl: { x0: -9.0, y0: -12.2, x1: 9.8, y1: 0.2 },
  sushi: { x0: -6.4, y0: -7.6, x1: 6.4, y1: 0.4 },
  onigiri: { x0: -5.8, y0: -9.6, x1: 5.8, y1: 0.6 },
  dango: { x0: -5.8, y0: -12.5, x1: 2.0, y1: 2.1 },
  matcha: { x0: -6.4, y0: -13.2, x1: 6.4, y1: 0.2 },
  daruma: { x0: -5.4, y0: -11.3, x1: 5.4, y1: 0.3 },
  koinobori: { x0: -1.1, y0: -22.7, x1: 13.4, y1: 0.2 },
  origamiCrane: { x0: -6.8, y0: -6.0, x1: 6.7, y1: 0.7 },
  sumoRing: { x0: -13.7, y0: -15.1, x1: 13.7, y1: 1.9 },
  palaceGate: { x0: -14.4, y0: -18.5, x1: 14.4, y1: 0.2 },
  hillTower: { x0: -10.4, y0: -30.2, x1: 10.4, y1: 0.6 },
  hanok: { x0: -10.6, y0: -11.3, x1: 10.6, y1: 0.2 },
  onggi: { x0: -9.7, y0: -10.3, x1: 10.2, y1: 0.4 },
  bibimbap: { x0: -9.0, y0: -10.2, x1: 9.0, y1: 0.2 },
  gimbap: { x0: -8.7, y0: -6.3, x1: 8.7, y1: 0.3 },
  dolHareubang: { x0: -4.9, y0: -18.2, x1: 4.9, y1: 0.3 },
  mugunghwa: { x0: -7.2, y0: -5.6, x1: 7.2, y1: 5.9 },
  turtleShip: { x0: -15.7, y0: -19.7, x1: 12.7, y1: 1.1 },
  stoneObservatory: { x0: -6.0, y0: -15.0, x1: 6.0, y1: 0.2 },
  tiger: { x0: -8.0, y0: -11.8, x1: 9.8, y1: 0.2 },
  crab: { x0: -8.8, y0: -8.2, x1: 8.8, y1: 4.1 },
  tangerine: { x0: -6.0, y0: -6.9, x1: 6.0, y1: 0.2 },
  hahoeMask: { x0: -4.7, y0: -6.7, x1: 4.7, y1: 6.3 },
  hanbok: { x0: -10.2, y0: -42.2, x1: 10.2, y1: 0.5, defaultScale: 0.52 },
  // 22 new elements (China/East Asia, Europe, Universal)
  pavilion: { x0: -9.5, y0: -16.5, x1: 9.5, y1: 0.2 },
  greatWall: { x0: -13.0, y0: -14.5, x1: 13.0, y1: 0.4 },
  archBridge: { x0: -12.5, y0: -8.5, x1: 12.5, y1: 0.8 },
  lantern: { x0: -5.2, y0: -15.6, x1: 5.2, y1: 0.2 },
  panda: { x0: -6.8, y0: -12.8, x1: 7.4, y1: 0.3 },
  dumplings: { x0: -8.6, y0: -11.5, x1: 8.6, y1: 0.2 },
  teapot: { x0: -8.5, y0: -11.5, x1: 9.2, y1: 0.2 },
  cathedral: { x0: -10.5, y0: -23.5, x1: 10.5, y1: 0.2 },
  europeanCastle: { x0: -12.5, y0: -20.5, x1: 12.5, y1: 0.2 },
  windmill: { x0: -9.5, y0: -20.5, x1: 9.5, y1: 0.2 },
  romanArch: { x0: -10.5, y0: -14.8, x1: 10.5, y1: 0.2 },
  vineyard: { x0: -10.0, y0: -11.8, x1: 10.0, y1: 0.2 },
  oliveTree: { x0: -7.5, y0: -13.5, x1: 7.5, y1: 0.2 },
  cheeseWine: { x0: -8.5, y0: -13.5, x1: 8.5, y1: 0.2 },
  palmTree: { x0: -8.5, y0: -16.5, x1: 9.5, y1: 0.2 },
  volcano: { x0: -14.5, y0: -19.0, x1: 14.5, y1: 0.8 },
  waterfall: { x0: -10.5, y0: -14.5, x1: 10.5, y1: 0.8 },
  train: { x0: -13.0, y0: -11.5, x1: 13.5, y1: 0.8 },
  ship: { x0: -12.5, y0: -18.5, x1: 12.5, y1: 0.8 },
  hotAirBalloon: { x0: -7.2, y0: -20.5, x1: 7.2, y1: 0.2 },
  fish: { x0: -7.5, y0: -4.2, x1: 8.5, y1: 4.2 },
  yurt: { x0: -9.5, y0: -12.5, x1: 9.5, y1: 0.2 },
};

const ELEMENT_META = {
  tree: { category: 'nature', region: 'world', anchor: 'bottom-center', rotatable: false, tags: ['forest', 'foliage'] },
  sakura: { category: 'nature', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['cherry-blossom', 'spring', 'tree'] },
  pine: { category: 'nature', region: 'world', anchor: 'bottom-center', rotatable: false, tags: ['evergreen', 'conifer', 'tree'] },
  bamboo: { category: 'nature', region: 'china', anchor: 'bottom-center', rotatable: false, tags: ['grove', 'east-asia', 'plant'] },
  mountain: { category: 'nature', region: 'world', anchor: 'bottom-center', rotatable: false, tags: ['peak', 'snow', 'fuji'] },
  onsen: { category: 'nature', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['hot-spring', 'spa', 'steam'] },
  torii: { category: 'architecture', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['shrine', 'gate', 'shinto'] },
  pagoda: { category: 'architecture', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['temple', 'tower', 'east-asia'] },
  castle: { category: 'architecture', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['fortress', 'keep', 'landmark'] },
  tokyoTower: { category: 'architecture', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['tower', 'landmark', 'tokyo'] },
  house: { category: 'architecture', region: 'world', anchor: 'bottom-center', rotatable: false, tags: ['village', 'home', 'building'] },
  lighthouse: { category: 'architecture', region: 'world', anchor: 'bottom-center', rotatable: false, tags: ['coast', 'beacon', 'marine'] },
  shinkansen: { category: 'transport', region: 'japan', anchor: 'bottom-center', rotatable: true, tags: ['bullet-train', 'rail'] },
  sailboat: { category: 'transport', region: 'world', anchor: 'bottom-center', rotatable: false, tags: ['boat', 'sea', 'sailing'] },
  whale: { category: 'marine', region: 'world', anchor: 'center', rotatable: false, tags: ['ocean', 'animal', 'sea'] },
  shibaInu: { category: 'animal', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['dog', 'pet'] },
  deer: { category: 'animal', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['wildlife', 'nara'] },
  crane: { category: 'animal', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['bird', 'wildlife'] },
  koi: { category: 'marine', region: 'japan', anchor: 'center', rotatable: true, tags: ['fish', 'pond', 'carp'] },
  foodBowl: { category: 'food', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['ramen', 'noodles', 'cuisine'] },
  sushi: { category: 'food', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['nigiri', 'seafood', 'cuisine'] },
  onigiri: { category: 'food', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['rice-ball', 'snack', 'cuisine'] },
  dango: { category: 'food', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['sweet', 'dessert', 'skewer'] },
  matcha: { category: 'food', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['tea', 'drink', 'bowl'] },
  daruma: { category: 'culture', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['doll', 'craft', 'luck'] },
  koinobori: { category: 'culture', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['streamer', 'festival', 'carp'] },
  origamiCrane: { category: 'culture', region: 'japan', anchor: 'center', rotatable: false, tags: ['paper', 'craft'] },
  sumoRing: { category: 'culture', region: 'japan', anchor: 'bottom-center', rotatable: false, tags: ['wrestling', 'sport', 'dohyo'] },
  palaceGate: { category: 'architecture', region: 'korea', anchor: 'bottom-center', rotatable: false, tags: ['palace', 'gate', 'seoul'] },
  hillTower: { category: 'architecture', region: 'korea', anchor: 'bottom-center', rotatable: false, tags: ['tower', 'landmark', 'seoul'] },
  hanok: { category: 'architecture', region: 'korea', anchor: 'bottom-center', rotatable: false, tags: ['house', 'traditional', 'roof'] },
  onggi: { category: 'culture', region: 'korea', anchor: 'bottom-center', rotatable: false, tags: ['pottery', 'jar', 'kimchi'] },
  bibimbap: { category: 'food', region: 'korea', anchor: 'bottom-center', rotatable: false, tags: ['rice', 'bowl', 'cuisine'] },
  gimbap: { category: 'food', region: 'korea', anchor: 'bottom-center', rotatable: false, tags: ['roll', 'seaweed', 'cuisine'] },
  dolHareubang: { category: 'culture', region: 'korea', anchor: 'bottom-center', rotatable: false, tags: ['statue', 'jeju', 'stone'] },
  mugunghwa: { category: 'nature', region: 'korea', anchor: 'center', rotatable: false, tags: ['flower', 'hibiscus', 'national'] },
  turtleShip: { category: 'transport', region: 'korea', anchor: 'bottom-center', rotatable: false, tags: ['warship', 'history', 'sea'] },
  stoneObservatory: { category: 'architecture', region: 'korea', anchor: 'bottom-center', rotatable: false, tags: ['cheomseongdae', 'gyeongju', 'astronomy'] },
  tiger: { category: 'animal', region: 'korea', anchor: 'bottom-center', rotatable: false, tags: ['wildlife', 'big-cat'] },
  crab: { category: 'marine', region: 'world', anchor: 'center', rotatable: false, tags: ['seafood', 'coast', 'animal'] },
  tangerine: { category: 'food', region: 'korea', anchor: 'bottom-center', rotatable: false, tags: ['citrus', 'fruit', 'jeju'] },
  hahoeMask: { category: 'culture', region: 'korea', anchor: 'center', rotatable: false, tags: ['mask', 'festival', 'andong'] },
  hanbok: { category: 'culture', region: 'korea', anchor: 'bottom-center', rotatable: false, tags: ['costume', 'person', 'traditional'] },
  // 22 new elements
  pavilion: { category: 'architecture', region: 'china', anchor: 'bottom-center', rotatable: false, tags: ['ting', 'garden', 'eaves', 'east-asia'] },
  greatWall: { category: 'architecture', region: 'china', anchor: 'bottom-center', rotatable: false, tags: ['fortress', 'watchtower', 'landmark'] },
  archBridge: { category: 'architecture', region: 'china', anchor: 'bottom-center', rotatable: false, tags: ['bridge', 'canal', 'water-town'] },
  lantern: { category: 'culture', region: 'china', anchor: 'bottom-center', rotatable: false, tags: ['festival', 'red', 'lamp'] },
  panda: { category: 'animal', region: 'china', anchor: 'bottom-center', rotatable: false, tags: ['sichuan', 'bamboo', 'wildlife'] },
  dumplings: { category: 'food', region: 'china', anchor: 'bottom-center', rotatable: false, tags: ['dim-sum', 'steamer', 'bao', 'cuisine'] },
  teapot: { category: 'food', region: 'china', anchor: 'bottom-center', rotatable: false, tags: ['tea', 'ceramics', 'drink'] },
  cathedral: { category: 'architecture', region: 'europe', anchor: 'bottom-center', rotatable: false, tags: ['gothic', 'church', 'spires'] },
  europeanCastle: { category: 'architecture', region: 'europe', anchor: 'bottom-center', rotatable: false, tags: ['chateau', 'fortress', 'medieval'] },
  windmill: { category: 'architecture', region: 'europe', anchor: 'bottom-center', rotatable: false, tags: ['mill', 'netherlands', 'countryside'] },
  romanArch: { category: 'architecture', region: 'europe', anchor: 'bottom-center', rotatable: false, tags: ['classical', 'triumphal', 'italy', 'france'] },
  vineyard: { category: 'nature', region: 'europe', anchor: 'bottom-center', rotatable: false, tags: ['grapes', 'wine', 'agriculture'] },
  oliveTree: { category: 'nature', region: 'europe', anchor: 'bottom-center', rotatable: false, tags: ['mediterranean', 'tree', 'grove'] },
  cheeseWine: { category: 'food', region: 'europe', anchor: 'bottom-center', rotatable: false, tags: ['wine', 'cheese', 'gastronomy'] },
  palmTree: { category: 'nature', region: 'world', anchor: 'bottom-center', rotatable: false, tags: ['tropical', 'coast', 'island'] },
  volcano: { category: 'nature', region: 'world', anchor: 'bottom-center', rotatable: false, tags: ['mountain', 'lava', 'geology'] },
  waterfall: { category: 'nature', region: 'world', anchor: 'bottom-center', rotatable: false, tags: ['cascade', 'river', 'cliff'] },
  train: { category: 'transport', region: 'world', anchor: 'bottom-center', rotatable: true, tags: ['locomotive', 'steam', 'rail'] },
  ship: { category: 'transport', region: 'world', anchor: 'bottom-center', rotatable: false, tags: ['galleon', 'sailing', 'sea'] },
  hotAirBalloon: { category: 'transport', region: 'world', anchor: 'bottom-center', rotatable: false, tags: ['balloon', 'sky', 'travel'] },
  fish: { category: 'marine', region: 'world', anchor: 'center', rotatable: true, tags: ['sea', 'ocean', 'fishing'] },
  yurt: { category: 'architecture', region: 'world', anchor: 'bottom-center', rotatable: false, tags: ['ger', 'nomad', 'steppe', 'tent'] },
};

function elementBBox(name, cx = 0, cy = 0, s, a = 0) {
  const b = ELEMENT_BOUNDS[name];
  if (!b) throw new Error(`Unknown element: "${name}"`);
  const sc = s ?? b.defaultScale ?? 1;
  const T = at(cx, cy, sc, a || 0);
  const corners = T([
    [b.x0, b.y0],
    [b.x1, b.y0],
    [b.x1, b.y1],
    [b.x0, b.y1],
  ]);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of corners) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  return { x: minX, y: minY, w, h, x0: minX, y0: minY, x1: minX + w, y1: minY + h };
}

// --- NATURE ---
function tree(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  part(P, T([[-0.9, -4.5], [0.9, -4.5], [1.2, 0], [-1.2, 0]]), C.wood, { nib: 0.15 });
  const crown = T(D.curve([[-4.2, -5.0], [-4.8, -8.5], [-2.2, -11.4], [1.8, -11.6], [4.6, -8.8], [4.0, -5.0]]));
  part(P, crown, o.color || C.forest, { nib: 0.18, shade: T([[1, -12], [5.5, -12], [5.5, -4], [1, -4]]), hatch: 75 });
  return elementBBox('tree', cx, by, s);
}

function sakura(P, cx, by, s = 1) {
  tree(P, cx, by, s, { color: C.sakura });
  const T = at(cx, by, s);
  for (const [px, py] of [[-5.6, -6.4], [5.8, -7.8], [4.6, -3.5]]) {
    part(P, T(D.ell(px, py, 0.7, 0.45, 0.5)), C.sakura, { nib: 0.08, passes: 1 });
  }
  return elementBBox('sakura', cx, by, s);
}

function pine(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  part(P, T([[-0.7, -3.2], [0.7, -3.2], [0.9, 0], [-0.9, 0]]), C.wood, { nib: 0.13 });
  for (const [y0, w, h] of [[-2.4, 4.4, 4.6], [-5.4, 3.6, 4.4], [-8.2, 2.7, 4.0]]) {
    part(P, T([[-w, y0], [0, y0 - h], [w, y0]]), o.color || C.forestDark, { nib: 0.16 });
  }
  return elementBBox('pine', cx, by, s);
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
  return elementBBox('bamboo', cx, by, s);
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
  return elementBBox('mountain', cx, by, s);
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
  return elementBBox('onsen', cx, by, s);
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
  return elementBBox('torii', cx, by, s);
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
  return elementBBox('pagoda', cx, by, s);
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
  return elementBBox('castle', cx, by, s);
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
  return elementBBox('tokyoTower', cx, by, s);
}

function house(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  part(P, T([[-6, -6.5], [6, -6.5], [6, 0], [-6, 0]]), o.wall || C.cream, { nib: 0.18 });
  part(P, T([[-7.6, -6.2], [0, -11.4], [7.6, -6.2]]), o.roof || C.terracotta, { nib: 0.2 });
  part(P, T([[-1.6, -4.2], [1.6, -4.2], [1.6, 0], [-1.6, 0]]), C.wood, { nib: 0.14 });
  part(P, T([[2.8, -4.8], [4.8, -4.8], [4.8, -2.8], [2.8, -2.8]]), C.ocean, { nib: 0.12 });
  return elementBBox('house', cx, by, s);
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
  return elementBBox('lighthouse', cx, by, s);
}

// --- TRANSPORT ---
function shinkansen(P, cx, by, s = 1, a = 0, o = {}) {
  const T = at(cx, by, s, a);
  // Sleek white bullet train nose + coach
  const body = T(D.curve([[-14, 0], [-14, -5.2], [6, -5.2], [11, -4.4], [15.5, -1.6], [15.0, 0]]));
  part(P, body, o.body || C.paper, { nib: 0.2, pressure: 0.4 });
  // Signature blue stripe
  part(P, T([[-13.8, -2.0], [13.5, -2.0], [14.4, -1.0], [-13.8, -1.0]]), o.stripe || C.navy, { nib: 0.12 });
  // Windows
  for (const wx of [-11, -7, -3, 1, 5]) {
    part(P, T(D.rrect(wx, -4.2, wx + 2.4, -2.6, 0.3)), C.oceanDeep, { nib: 0.1, passes: 1 });
  }
  // Track line
  P.ink(T([[-16, 0.6], [17, 0.6]]), { nib: 0.16, color: C.slate });
  return elementBBox('shinkansen', cx, by, s, a);
}

function sailboat(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  P.ink(T([[0, -3], [0, -15.5]]), { nib: 0.22 });
  part(P, T([[0.4, -14.8], [7.2, -5.2], [0.4, -5.2]]), o.sail || C.cream, { nib: 0.18 });
  part(P, T([[-0.5, -13.2], [-5.2, -5.5], [-0.5, -5.5]]), o.sail2 || C.ochre, { nib: 0.16 });
  part(P, T([[-8.2, -3.4], [8.2, -3.4], [5.8, 0], [-5.8, 0]]), C.terracotta, { nib: 0.2 });
  P.ink(T([[-9.5, 0.4], [9.5, 0.4]]), { nib: 0.14, color: '#6b93a8' });
  return elementBBox('sailboat', cx, by, s);
}

// --- ANIMALS ---
function whale(P, cx, cy, s = 1) {
  const T = at(cx, cy, s);
  const body = T(D.curve([[-10, 0], [-8, -5.5], [-1, -6.8], [6, -4.5], [10, -2.5], [13.5, -5.2], [11.5, -1.2], [14.2, 0.8], [9.5, 0.2], [4, 2.2], [-5, 2.0]]));
  part(P, body, C.navy, { nib: 0.2, pressure: 0.72 });
  P.dot(...T([[-5.8, -1.4]])[0], 0.5 * s, C.paper);
  P.curve(T([[-4.5, -6.5], [-5.2, -10.5], [-7.6, -11.4]]), { nib: 0.14, color: '#6b93a8' });
  P.curve(T([[-4.0, -6.5], [-3.2, -10.5], [-0.8, -11.4]]), { nib: 0.14, color: '#6b93a8' });
  return elementBBox('whale', cx, cy, s);
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
  return elementBBox('shibaInu', cx, by, s);
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
  return elementBBox('deer', cx, by, s);
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
  return elementBBox('crane', cx, by, s);
}

function koi(P, cx, cy, s = 1, a = 0) {
  const T = at(cx, cy, s, a);
  const body = T(D.curve([[-6.5, 0], [-3.5, -2.5], [2, -2.2], [6.5, 0], [9.2, -2.4], [8.2, 0], [9.2, 2.4], [6.5, 0], [2, 2.2], [-3.5, 2.5]]));
  part(P, body, C.paper, { nib: 0.16, pressure: 0.4 });
  part(P, T(D.ell(-2.2, -0.5, 2.0, 1.4)), C.vermilion, { nib: 0.08, passes: 1 });
  part(P, T(D.ell(2.5, 0.4, 1.6, 1.1)), C.orange, { nib: 0.08, passes: 1 });
  P.dot(...T([[-4.6, -0.5]])[0], 0.35 * s, C.ink);
  return elementBBox('koi', cx, cy, s, a);
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
  return elementBBox('foodBowl', cx, by, s);
}

function sushi(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  part(P, T(D.rrect(-5.2, -4.4, 5.2, 0, 1.8)), C.paper, { nib: 0.16, pressure: 0.4 });
  part(P, T(D.curve([[-6.2, -3.8], [-4.5, -6.8], [0, -7.4], [4.5, -6.8], [6.2, -3.8], [0, -3.2]])), C.vermilion, { nib: 0.16 });
  part(P, T([[-1.6, -7.2], [1.6, -7.2], [1.6, 0.2], [-1.6, 0.2]]), C.ink, { nib: 0.12 });
  return elementBBox('sushi', cx, by, s);
}

function onigiri(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  const tri = T(D.curve([[-5.4, 0], [-4.8, -3.5], [0, -9.2], [4.8, -3.5], [5.4, 0]]));
  part(P, tri, C.paper, { nib: 0.18, pressure: 0.35 });
  part(P, T([[-2.6, -3.4], [2.6, -3.4], [2.8, 0.1], [-2.8, 0.1]]), C.ink, { nib: 0.14 });
  return elementBBox('onigiri', cx, by, s);
}

function dango(P, cx, by, s = 1) {
  const T = at(cx, by, s, -0.35);
  P.ink(T([[0, 2], [0, -13]]), { nib: 0.18, color: C.wood });
  part(P, T(D.ell(0, -3.2, 2.2, 2.0)), C.matcha, { nib: 0.14 });
  part(P, T(D.ell(0, -6.8, 2.2, 2.0)), C.paper, { nib: 0.14, pressure: 0.4 });
  part(P, T(D.ell(0, -10.4, 2.2, 2.0)), C.sakura, { nib: 0.14 });
  return elementBBox('dango', cx, by, s);
}

function matcha(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  part(P, T([[-3.5, -1.2], [3.5, -1.2], [3.0, 0], [-3.0, 0]]), C.ink, { nib: 0.14 });
  part(P, T(D.curve([[-6.2, -6.8], [-5.8, -2.5], [-3.6, -1.2], [3.6, -1.2], [5.8, -2.5], [6.2, -6.8]])), '#4f4844', { nib: 0.18 });
  part(P, T(D.ell(0, -6.8, 6.0, 1.6)), C.matcha, { nib: 0.14 });
  P.curve(T([[-1.2, -8.5], [-0.4, -10.8], [-1.4, -13.0]]), { nib: 0.11, color: '#7a7378' });
  P.curve(T([[1.4, -8.5], [2.2, -10.8], [1.2, -13.0]]), { nib: 0.11, color: '#7a7378' });
  return elementBBox('matcha', cx, by, s);
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
  return elementBBox('daruma', cx, by, s);
}

function koinobori(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  P.ink(T([[0, 0], [0, -21]]), { nib: 0.24, color: C.wood });
  part(P, T(D.ell(0, -21.6, 0.9, 0.9)), C.gold, { nib: 0.12 });
  for (const [yy, len, col] of [[-18.5, 11, C.navy], [-14.0, 9.2, C.vermilion], [-10.0, 7.4, C.matcha]]) {
    const fishPts = T([[0.6, yy], [len, yy - 1.4], [len + 2.2, yy - 2.6], [len + 1.2, yy], [len + 2.2, yy + 2.2], [len, yy + 1.2], [0.6, yy + 1.8]]);
    part(P, fishPts, col, { nib: 0.14 });
    P.dot(...T([[2.4, yy + 0.5]])[0], 0.35 * s, C.paper);
  }
  return elementBBox('koinobori', cx, by, s);
}

function origamiCrane(P, cx, cy, s = 1) {
  const T = at(cx, cy, s);
  part(P, T([[-6.5, -3.5], [0, 0.5], [6.5, -3.5], [2.2, -1.0], [0, -4.5], [-2.2, -1.0]]), C.sakura, { nib: 0.15 });
  part(P, T([[-2.2, -1.0], [-5.2, -5.8], [-6.6, -4.8], [-3.0, -0.5]]), C.sakura, { nib: 0.14 });
  part(P, T([[2.2, -1.0], [5.8, -5.5], [3.8, -0.2]]), C.sakura, { nib: 0.14 });
  return elementBBox('origamiCrane', cx, cy, s);
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
  return elementBBox('sumoRing', cx, by, s);
}

// --- KOREA ---
// Two-storey palace gate on a stone base (Gwanghwamun, Sungnyemun ...)
function palaceGate(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  part(P, T([[-11.5, -7.2], [11.5, -7.2], [12, 0], [-12, 0]]), STONE, { nib: 0.2, shade: T([[3, -8], [13, -8], [13, 1], [3, 1]]), hatch: 75 });
  for (const [ax, aw, ah] of [[-6.4, 1.5, 3.6], [0, 2.0, 4.6], [6.4, 1.5, 3.6]]) {
    const arch = [[ax - aw, 0], [ax - aw, -ah + aw], ...D.ell(ax, -ah + aw, aw, aw, 0, 16).slice(8), [ax + aw, -ah + aw], [ax + aw, 0]];
    part(P, T(arch), C.ink, { nib: 0.12 });
  }
  const roof = (y, half, rise) => T(D.curve([[-half - 2.6, y - 1.5], [-half, y], [half, y], [half + 2.6, y - 1.5], [half - 2.4, y - rise], [-half + 2.4, y - rise]], true, 0.4));
  part(P, T([[-9.6, -10.4], [9.6, -10.4], [9.6, -7.2], [-9.6, -7.2]]), o.wall || C.crimson, { nib: 0.16 });
  part(P, roof(-9.6, 11.4, 2.6), o.roof || TILE, { nib: 0.18 });
  part(P, T([[-7.6, -15.0], [7.6, -15.0], [7.6, -12.2], [-7.6, -12.2]]), o.wall || C.crimson, { nib: 0.16 });
  part(P, T([[-7.6, -15.0], [7.6, -15.0], [7.6, -14.2], [-7.6, -14.2]]), C.forestDark, { nib: 0.1, passes: 1 });
  part(P, roof(-14.4, 9.6, 3.6), o.roof || TILE, { nib: 0.18 });
  P.ink(T([[-6.4, -18.1], [6.4, -18.1]]), { nib: 0.3 * s, color: C.ink });
  return elementBBox('palaceGate', cx, by, s);
}

// Slim observation tower on a wooded hill (N Seoul Tower)
function hillTower(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  part(P, T(D.curve([[-10, 0], [-7.5, -3.6], [-2.5, -6.2], [3, -6.0], [7.8, -3.4], [10, 0]], true, 0.4)), C.forest, { nib: 0.18, shade: T([[2, -7], [11, -7], [11, 1], [2, 1]]), hatch: 70 });
  part(P, T([[-0.8, -19], [0.8, -19], [1.1, -5.6], [-1.1, -5.6]]), C.paper, { nib: 0.16, pressure: 0.4 });
  part(P, T(D.rrect(-3.0, -22.2, 3.0, -18.6, 0.8)), C.slate, { nib: 0.16 });
  part(P, T([[-3.0, -20.9], [3.0, -20.9], [3.0, -19.9], [-3.0, -19.9]]), C.navy, { nib: 0.08, passes: 1 });
  part(P, T([[-1.7, -23.8], [1.7, -23.8], [2.1, -22.2], [-2.1, -22.2]]), C.paper, { nib: 0.14, pressure: 0.4 });
  P.ink(T([[0, -23.8], [0, -30]]), { nib: 0.2, color: C.vermilion });
  return elementBBox('hillTower', cx, by, s);
}

// Traditional tile-roofed house with upturned eaves
function hanok(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  part(P, T([[-7.2, -0.9], [7.2, -0.9], [7.6, 0], [-7.6, 0]]), STONE, { nib: 0.14 });
  part(P, T([[-6.4, -5.8], [6.4, -5.8], [6.4, -0.9], [-6.4, -0.9]]), o.wall || C.cream, { nib: 0.16 });
  for (const px of [-6.4, -2.2, 2.2, 6.4]) P.ink(T([[px, -5.8], [px, -0.9]]), { nib: 0.22 * s, color: C.brown });
  part(P, T([[-1.5, -4.6], [1.5, -4.6], [1.5, -0.9], [-1.5, -0.9]]), C.wood, { nib: 0.12 });
  const roof = T(D.curve([[-10.2, -7.4], [-7, -5.6], [7, -5.6], [10.2, -7.4], [6.2, -10.8], [-6.2, -10.8]], true, 0.4));
  part(P, roof, o.roof || TILE, { nib: 0.2 });
  P.ink(T([[-5.6, -10.9], [5.6, -10.9]]), { nib: 0.28 * s, color: C.ink });
  return elementBBox('hanok', cx, by, s);
}

// Earthenware fermentation jars (kimchi, soy sauce, gochujang)
function onggi(P, cx, by, s = 1) {
  const T0 = at(cx, by, s);
  for (const [dx, k] of [[-6.2, 0.82], [6.4, 0.9], [0, 1.2]]) {
    const T = (pts) => T0(pts.map(([x, y]) => [dx + x * k, y * k]));
    part(P, T(D.curve([[-2.3, 0], [-3.8, -3.4], [-2.7, -6.6], [2.7, -6.6], [3.8, -3.4], [2.3, 0]], true, 0.4)), C.brown, { nib: 0.18, shade: T([[1, -7], [4.5, -7], [4.5, 0.5], [1, 0.5]]), hatch: 72 });
    part(P, T(D.ell(0, -6.9, 3.1, 0.95)), '#6e4630', { nib: 0.14 });
    part(P, T(D.ell(0, -7.9, 0.8, 0.5)), '#6e4630', { nib: 0.1, passes: 1 });
  }
  return elementBBox('onggi', cx, by, s);
}

// Mixed rice in a hot stone bowl
function bibimbap(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  part(P, T([[-5.4, -1.2], [5.4, -1.2], [6.2, 0], [-6.2, 0]]), C.wood, { nib: 0.14 });
  part(P, T(D.curve([[-8.8, -7.4], [-7.6, -3.0], [-4.4, -1.2], [4.4, -1.2], [7.6, -3.0], [8.8, -7.4]])), '#4a4548', { nib: 0.2 });
  part(P, T(D.ell(0, -7.4, 8.6, 2.6)), C.paper, { nib: 0.16, pressure: 0.4 });
  for (const [tx, ty, rx, ry, col] of [
    [-5.2, -7.6, 2.3, 1.1, C.matcha], [-1.8, -9.0, 2.2, 0.9, C.orange], [2.6, -8.9, 2.2, 0.9, C.brown],
    [5.4, -7.5, 2.2, 1.1, C.gold], [-2.6, -6.0, 2.3, 0.9, C.crimson], [2.8, -6.0, 2.3, 0.9, C.forestDark],
  ]) part(P, T(D.ell(tx, ty, rx, ry)), col, { nib: 0.09, passes: 1 });
  part(P, T(D.ell(0, -7.5, 2.3, 1.25)), C.paper, { nib: 0.11, pressure: 0.3 });
  part(P, T(D.ell(0, -7.6, 1.0, 0.62)), C.ochre, { nib: 0.09, passes: 1 });
  return elementBBox('bibimbap', cx, by, s);
}

// Seaweed rice rolls
function gimbap(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  for (const [gx, gy] of [[-5.4, -2.6], [5.4, -2.6], [0, -3.4]]) {
    part(P, T(D.ell(gx, gy, 3.1, 2.7)), '#33353a', { nib: 0.16 });
    part(P, T(D.ell(gx, gy, 2.3, 1.95)), C.paper, { nib: 0.08, pressure: 0.3, passes: 1 });
    for (const [dx, dy, col] of [[-0.8, -0.4, C.ochre], [0.7, -0.5, C.orange], [0, 0.6, C.matcha]]) {
      part(P, T(D.ell(gx + dx, gy + dy, 0.62, 0.55)), col, { nib: 0.06, passes: 1 });
    }
  }
  return elementBBox('gimbap', cx, by, s);
}

// Jeju "stone grandfather" guardian statue
function dolHareubang(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  const shade = T([[1, -19], [6, -19], [6, 1], [1, 1]]);
  part(P, T(D.curve([[-3.8, 0], [-4.6, -5.5], [-3.6, -10.6], [3.6, -10.6], [4.6, -5.5], [3.8, 0]], true, 0.4)), C.slate, { nib: 0.18, shade, hatch: 72 });
  part(P, T(D.ell(0, -12.6, 3.7, 3.2)), C.slate, { nib: 0.18, shade, hatch: 72 });
  part(P, T(D.curve([[-3.9, -14.6], [-3.0, -17.8], [3.0, -17.8], [3.9, -14.6]], true, 0.4)), '#6f7f88', { nib: 0.16 });
  part(P, T(D.rrect(-4.5, -15.2, 4.5, -14.2, 0.4)), '#6f7f88', { nib: 0.14 });
  for (const sd of [-1, 1]) {
    part(P, T(D.ell(sd * 1.7, -13.0, 1.05, 0.8)), C.paper, { nib: 0.12, pressure: 0.3, passes: 1 });
    P.dot(...T([[sd * 1.7, -13.0]])[0], 0.3 * s, C.ink);
  }
  part(P, T(D.ell(0, -11.6, 0.75, 1.1)), '#a9b6bd', { nib: 0.1, passes: 1 });
  P.ink(T([[-1.2, -10.2], [1.2, -10.2]]), { nib: 0.12 });
  // Hands resting on the belly, one above the other
  P.curve(T([[-4.2, -7.6], [-1.6, -6.4], [1.6, -7.2]]), { nib: 0.16 });
  P.curve(T([[4.2, -5.4], [1.6, -4.2], [-1.6, -5.0]]), { nib: 0.16 });
  return elementBBox('dolHareubang', cx, by, s);
}

// Rose of Sharon, the national flower
function mugunghwa(P, cx, cy, s = 1, o = {}) {
  const T = at(cx, cy, s);
  for (const [lx, ly, a] of [[-4.6, 3.2, 0.6], [4.6, 3.2, -0.6]]) part(P, T(D.ell(lx, ly, 2.8, 1.2, a)), C.forest, { nib: 0.1, passes: 1 });
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    part(P, T(D.ell(Math.cos(a) * 2.7, Math.sin(a) * 2.7, 2.7, 1.9, a)), o.color || '#eeb1c9', { nib: 0.12 });
  }
  part(P, T(D.ell(0, 0, 1.7, 1.7)), C.crimson, { nib: 0.08, passes: 1 });
  part(P, T(D.ell(0, 0, 0.6, 0.6)), C.gold, { nib: 0.06, passes: 1 });
  return elementBBox('mugunghwa', cx, cy, s);
}

// Armoured "turtle ship" warship (geobukseon)
function turtleShip(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  P.ink(T([[1.5, -8.6], [1.5, -19.5]]), { nib: 0.22 });
  part(P, T([[-3.4, -18.6], [6.4, -18.6], [6.4, -10.6], [-3.4, -10.6]]), C.cream, { nib: 0.16 });
  for (const yy of [-16.6, -14.6, -12.6]) P.ink(T([[-3.4, yy], [6.4, yy]]), { nib: 0.09, color: C.brown });
  // Dragon-head prow
  P.curve(T([[-9.6, -5.2], [-12.4, -7.4], [-12.8, -10.2]]), { nib: 0.5 * s, color: C.forestDark });
  part(P, T(D.ell(-13.6, -10.8, 1.9, 1.25, 0.25)), C.ochre, { nib: 0.14 });
  P.dot(...T([[-14.0, -11.2]])[0], 0.3 * s, C.ink);
  part(P, T(D.curve([[-10.6, -4.2], [-7.4, -8.2], [0, -9.6], [7.4, -8.2], [10.6, -4.2]], true, 0.4)), C.forestDark, { nib: 0.2 });
  for (const [sx, sy] of [[-6.6, -8.2], [-3.4, -9.2], [0, -9.7], [3.4, -9.2], [6.6, -8.2], [-5, -6.4], [0, -7.2], [5, -6.4]]) {
    P.ink(T([[sx, sy], [sx, sy - 1.3]]), { nib: 0.12 });
  }
  part(P, T([[-11.4, -4.4], [11.4, -4.4], [8.8, 0], [-8.8, 0]]), C.wood, { nib: 0.2 });
  for (const ox of [-6, -3, 0, 3, 6]) P.ink(T([[ox, -2.2], [ox - 1.2, 0.9]]), { nib: 0.12, color: C.brown });
  P.ink(T([[-12.5, 0.9], [12.5, 0.9]]), { nib: 0.14, color: '#6b93a8' });
  return elementBBox('turtleShip', cx, by, s);
}

// Bottle-shaped stone observatory (Cheomseongdae, Gyeongju)
function stoneObservatory(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  part(P, T([[-5.4, -1.0], [5.4, -1.0], [5.8, 0], [-5.8, 0]]), STONE, { nib: 0.14 });
  const body = T(D.curve([[-4.4, -1.0], [-4.0, -5.0], [-2.7, -10.0], [-2.5, -13.4], [2.5, -13.4], [2.7, -10.0], [4.0, -5.0], [4.4, -1.0]], true, 0.4));
  part(P, body, STONE, { nib: 0.18, shade: T([[0.8, -14], [5, -14], [5, 0], [0.8, 0]]), hatch: 72 });
  for (const yy of [-3.2, -5.4, -9.4, -11.4]) P.ink(T([[-3.6, yy], [3.6, yy]]), { nib: 0.08, color: '#8a8272' });
  part(P, T([[-0.9, -8.6], [0.9, -8.6], [0.9, -6.8], [-0.9, -6.8]]), C.ink, { nib: 0.1 });
  part(P, T([[-3.2, -14.8], [3.2, -14.8], [3.2, -13.4], [-3.2, -13.4]]), STONE, { nib: 0.16 });
  return elementBBox('stoneObservatory', cx, by, s);
}

function tiger(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  for (const lx of [-3.8, -1.6, 2.6, 4.6]) {
    part(P, T([[lx - 0.8, -3.6], [lx + 0.8, -3.6], [lx + 0.7, 0], [lx - 0.7, 0]]), C.orange, { nib: 0.14 });
  }
  P.curve(T([[5.8, -5.4], [8.6, -6.2], [9.4, -9.2]]), { nib: 0.55 * s, color: C.orange });
  P.curve(T([[5.8, -5.4], [8.6, -6.2], [9.4, -9.2]]), { nib: 0.1, color: C.ink });
  part(P, T(D.ell(0.8, -4.8, 5.6, 2.8)), C.orange, { nib: 0.18 });
  for (const sx of [-0.6, 1.4, 3.4]) P.ink(T([[sx, -7.3], [sx + 0.5, -5.2]]), { nib: 0.2 * s, color: C.ink });
  for (const ex of [-6.4, -2.6]) part(P, T(D.ell(ex, -10.6, 1.0, 1.0)), C.orange, { nib: 0.14 });
  part(P, T(D.ell(-4.5, -8.0, 3.3, 2.9)), C.orange, { nib: 0.18 });
  part(P, T(D.ell(-4.9, -6.9, 1.9, 1.2)), C.paper, { nib: 0.1, passes: 1 });
  for (const sx of [-5.2, -4.5, -3.8]) P.ink(T([[sx, -10.6], [sx, -9.6]]), { nib: 0.13, color: C.ink });
  P.dot(...T([[-5.9, -8.4]])[0], 0.36 * s, C.ink);
  P.dot(...T([[-3.5, -8.4]])[0], 0.36 * s, C.ink);
  P.dot(...T([[-4.9, -7.3]])[0], 0.3 * s, C.crimson);
  return elementBBox('tiger', cx, by, s);
}

function crab(P, cx, cy, s = 1, o = {}) {
  const T = at(cx, cy, s);
  const col = o.color || C.vermilion;
  for (const sd of [-1, 1]) {
    for (const [y0, reach] of [[-0.6, 7.8], [0.8, 8.4], [2.0, 7.4]]) {
      P.curve(T([[sd * 3.6, y0], [sd * (reach - 1.2), y0 - 1.6], [sd * reach, y0 + 1.8]]), { nib: 0.34 * s, color: col });
    }
    P.curve(T([[sd * 3.2, -1.8], [sd * 5.6, -4.4], [sd * 4.6, -6.0]]), { nib: 0.4 * s, color: col });
    part(P, T(D.ell(sd * 4.3, -6.6, 1.6, 1.1, sd * 0.6)), col, { nib: 0.12 });
    P.ink(T([[sd * 1.3, -2.4], [sd * 1.5, -3.8]]), { nib: 0.12 });
    P.dot(...T([[sd * 1.5, -4.0]])[0], 0.34 * s, C.ink);
  }
  part(P, T(D.ell(0, 0, 4.6, 3.0)), col, { nib: 0.18 });
  return elementBBox('crab', cx, cy, s);
}

function tangerine(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  for (const [tx, r] of [[-2.8, 3.0], [3.0, 2.6]]) {
    part(P, T(D.ell(tx, -r, r, r * 0.92)), C.orange, { nib: 0.16 });
    part(P, T(D.ell(tx + 1.2, -r * 1.95, 1.7, 0.7, -0.4)), C.forest, { nib: 0.09, passes: 1 });
    P.dot(...T([[tx, -r * 1.86]])[0], 0.28 * s, C.forestDark);
  }
  return elementBBox('tangerine', cx, by, s);
}

// Carved wooden festival mask (Hahoe, Andong)
function hahoeMask(P, cx, cy, s = 1) {
  const T = at(cx, cy, s);
  part(P, T(D.curve([[0, -6.4], [3.6, -5.4], [4.4, -1.0], [3.0, 3.6], [0, 6.0], [-3.0, 3.6], [-4.4, -1.0], [-3.6, -5.4]], true, 0.4)), C.wood, { nib: 0.2 });
  for (const sd of [-1, 1]) {
    P.curve(T([[sd * 0.9, -1.4], [sd * 2.1, -2.6], [sd * 3.3, -1.5]]), { nib: 0.2 });
    P.curve(T([[sd * 0.8, -3.6], [sd * 2.2, -4.6], [sd * 3.4, -3.6]]), { nib: 0.12 });
    part(P, T(D.ell(sd * 2.6, 0.8, 1.0, 0.65)), '#e39a86', { nib: 0.06, passes: 1 });
  }
  part(P, T(D.ell(0, 0.2, 0.9, 1.5)), '#a37445', { nib: 0.12 });
  P.curve(T([[-2.4, 2.4], [0, 4.4], [2.4, 2.4]]), { nib: 0.2 });
  P.curve(T([[-2.4, 2.4], [0, 3.0], [2.4, 2.4]]), { nib: 0.14 });
  return elementBBox('hahoeMask', cx, cy, s);
}

// Character in hanbok: short jacket (jeogori) over a full skirt (chima)
function hanbok(P, x, y, s = 0.52, o = {}) {
  const skirt = o.skirt || C.crimson;
  const res = person(P, x, y, s, {
    pose: 'stand',
    hair: 'bun',
    ...o,
    shirt: { color: o.jacket || C.cream },
    after: (P2, { L }) => {
      const chima = D.curve([[-5.0, -19.6], [5.0, -19.6], [7.4, -10], [9.6, -1.2], [0, -0.2], [-9.6, -1.2], [-7.4, -10]], true, 0.5);
      P2.shape([L(chima)], { fill: skirt, w: 1.0 });
      P2.line(L([[-0.4, -19.4], [1.8, -15.4], [1.2, -10.2]]), { w: 0.7 });
      P2.line(L([[-0.4, -19.4], [-1.6, -14.6]]), { w: 0.7 });
    },
  });
  return { ...elementBBox('hanbok', x, y, s), hand: res.hand, head: res.head, L: res.L };
}

// =========================================================================
// --- CHINA & EAST ASIA (7 new elements) ---
// =========================================================================

// Classical Chinese garden pavilion (ting) with double upturned eaves
function pavilion(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  const roofCol = o.roof || C.crimson;
  // Stepped stone plinth
  part(P, T([[-7.6, -1.8], [7.6, -1.8], [8.4, 0], [-8.4, 0]]), STONE, { nib: 0.16 });
  // Red columns & lattice balustrade
  for (const px of [-5.2, -1.8, 1.8, 5.2]) {
    part(P, T([[px - 0.55, -7.8], [px + 0.55, -7.8], [px + 0.55, -1.8], [px - 0.55, -1.8]]), C.vermilion, { nib: 0.12 });
  }
  part(P, T([[-5.6, -3.4], [5.6, -3.4], [5.6, -1.8], [-5.6, -1.8]]), C.cream, { nib: 0.12 });
  // Lower upturned roof
  const r1 = T(D.curve([[-9.2, -8.6], [-6.2, -7.4], [6.2, -7.4], [9.2, -8.6], [5.2, -10.8], [-5.2, -10.8]], true, 0.4));
  part(P, r1, roofCol, { nib: 0.18 });
  // Upper lantern story & double-eave peaked roof
  part(P, T([[-3.8, -12.4], [3.8, -12.4], [3.8, -10.4], [-3.8, -10.4]]), C.cream, { nib: 0.12 });
  const r2 = T(D.curve([[-6.8, -12.6], [-4.0, -11.6], [4.0, -11.6], [6.8, -12.6], [0, -15.4]], true, 0.4));
  part(P, r2, roofCol, { nib: 0.18 });
  // Gold finial
  part(P, T(D.ell(0, -15.8, 0.7, 0.65)), C.gold, { nib: 0.1 });
  return elementBBox('pavilion', cx, by, s);
}

// Great Wall watchtower and crenellated rampart winding over hills
function greatWall(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  // Green hillside ridge
  part(P, T(D.curve([[-12.6, 0], [-8.0, -5.2], [0, -7.5], [8.5, -4.6], [12.6, 0]], true, 0.4)), o.hill || C.forest, { nib: 0.18 });
  // Winding stone rampart
  part(P, T([[-11.5, -1.8], [-4.2, -7.6], [4.2, -7.6], [11.5, -2.4], [11.5, -0.4], [4.2, -5.4], [-4.2, -5.4], [-11.5, 0]]), STONE, { nib: 0.16 });
  // Battlement crenels along left & right walls
  for (const [bx, by0] of [[-9.2, -3.6], [-6.8, -5.6], [6.8, -5.8], [9.2, -4.0]]) {
    part(P, T([[bx - 0.7, by0 - 1.1], [bx + 0.7, by0 - 1.1], [bx + 0.7, by0], [bx - 0.7, by0]]), STONE, { nib: 0.1, passes: 1 });
  }
  // Square watchtower on crest
  part(P, T([[-4.4, -12.8], [4.4, -12.8], [5.0, -5.4], [-5.0, -5.4]]), STONE, { nib: 0.18, shade: T([[1.2, -13], [5.5, -13], [5.5, -5], [1.2, -5]]), hatch: 75 });
  // Tower battlements
  for (const tx of [-3.6, -1.2, 1.2, 3.6]) {
    part(P, T([[tx - 0.7, -14.1], [tx + 0.7, -14.1], [tx + 0.7, -12.8], [tx - 0.7, -12.8]]), STONE, { nib: 0.12 });
  }
  // Arched portal & embrasure windows
  part(P, T([[-1.2, -7.8], [1.2, -7.8], [1.2, -5.4], [-1.2, -5.4]]), C.ink, { nib: 0.1 });
  for (const wx of [-2.4, 0, 2.4]) {
    part(P, T([[wx - 0.5, -11.4], [wx + 0.5, -11.4], [wx + 0.5, -9.8], [wx - 0.5, -9.8]]), C.ink, { nib: 0.08, passes: 1 });
  }
  return elementBBox('greatWall', cx, by, s);
}

// Traditional humpback stone arch bridge over water
function archBridge(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  const col = o.color || STONE;
  // Bridge body with central arched opening
  const body = T([
    [-12.0, 0], [-12.0, -2.4], [-6.5, -5.8], [0, -7.4], [6.5, -5.8], [12.0, -2.4], [12.0, 0],
    [5.0, 0], [4.2, -2.8], [2.4, -4.6], [0, -5.2], [-2.4, -4.6], [-4.2, -2.8], [-5.0, 0],
  ]);
  part(P, body, col, { nib: 0.18, shade: T([[2, -8], [12.5, -8], [12.5, 0.2], [2, 0.2]]), hatch: 72 });
  // Parapet rail & stone posts
  P.curve(T([[-11.6, -3.3], [-6.2, -6.7], [0, -8.2], [6.2, -6.7], [11.6, -3.3]]), { nib: 0.16, color: C.ink });
  for (const [px, py] of [[-9.0, -4.8], [-4.5, -6.8], [0, -7.9], [4.5, -6.8], [9.0, -4.8]]) {
    P.ink(T([[px, py + 1.0], [px, py - 0.5]]), { nib: 0.22 * s, color: C.ink });
  }
  // Gentle water ripples below arch
  P.ink(T([[-11.0, 0.5], [11.0, 0.5]]), { nib: 0.14, color: '#6b93a8' });
  P.ink(T([[-5.2, -0.7], [5.2, -0.7]]), { nib: 0.11, color: '#6b93a8' });
  return elementBBox('archBridge', cx, by, s);
}

// Red festive Chinese paper lantern with gold caps & tassel
function lantern(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  const col = o.color || C.vermilion;
  // Hanging cord
  P.ink(T([[0, -15.4], [0, -13.0]]), { nib: 0.16, color: C.ink });
  // Red ribbed oval lantern body
  part(P, T(D.ell(0, -8.5, 4.9, 4.2)), col, { nib: 0.18 });
  // Curved ribs
  for (const rx of [-2.4, 2.4]) {
    P.curve(T([[0, -12.6], [rx, -8.5], [0, -4.4]]), { nib: 0.11, color: C.gold });
  }
  P.ink(T([[0, -12.6], [0, -4.4]]), { nib: 0.11, color: C.gold });
  // Top & bottom gold caps
  part(P, T(D.rrect(-2.2, -13.2, 2.2, -12.0, 0.3)), C.gold, { nib: 0.14 });
  part(P, T(D.rrect(-2.0, -4.8, 2.0, -3.6, 0.3)), C.gold, { nib: 0.14 });
  // Crimson tassel hanging to y = 0
  P.ink(T([[0, -3.6], [0, -0.2]]), { nib: 0.22 * s, color: C.crimson });
  P.ink(T([[-0.6, -2.6], [-1.0, -0.2]]), { nib: 0.13, color: C.crimson });
  P.ink(T([[0.6, -2.6], [1.0, -0.2]]), { nib: 0.13, color: C.crimson });
  return elementBBox('lantern', cx, by, s);
}

// Seated giant panda nibbling a bamboo sprig
function panda(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  // Seated white torso
  part(P, T(D.ell(-0.4, -4.6, 4.6, 4.2)), C.paper, { nib: 0.18, pressure: 0.35 });
  // Black hind paws
  part(P, T(D.ell(-3.6, -1.6, 2.0, 1.5, -0.25)), C.ink, { nib: 0.14 });
  part(P, T(D.ell(2.6, -1.6, 2.0, 1.5, 0.25)), C.ink, { nib: 0.14 });
  // Black shoulder band & arms
  part(P, T(D.ell(-3.6, -6.2, 1.7, 2.2, 0.35)), C.ink, { nib: 0.14 });
  part(P, T(D.ell(3.0, -6.0, 1.8, 2.1, -0.4)), C.ink, { nib: 0.14 });
  // Black round ears
  part(P, T(D.ell(-3.2, -11.4, 1.3, 1.2)), C.ink, { nib: 0.12 });
  part(P, T(D.ell(2.4, -11.4, 1.3, 1.2)), C.ink, { nib: 0.12 });
  // White head
  part(P, T(D.ell(-0.4, -9.2, 3.6, 3.1)), C.paper, { nib: 0.18, pressure: 0.35 });
  // Eye patches & nose
  part(P, T(D.ell(-1.8, -9.4, 1.1, 0.9, -0.3)), C.ink, { nib: 0.08, passes: 1 });
  part(P, T(D.ell(1.0, -9.4, 1.1, 0.9, 0.3)), C.ink, { nib: 0.08, passes: 1 });
  P.dot(...T([[-1.7, -9.4]])[0], 0.28 * s, C.paper);
  P.dot(...T([[0.9, -9.4]])[0], 0.28 * s, C.paper);
  part(P, T(D.ell(-0.4, -8.1, 0.65, 0.45)), C.ink, { nib: 0.08, passes: 1 });
  // Green bamboo sprig held on the right
  P.ink(T([[3.8, -1.5], [5.8, -11.2]]), { nib: 0.28 * s, color: C.forestDark });
  part(P, T(D.ell(6.0, -9.5, 1.4, 0.45, -0.4)), C.forest, { nib: 0.08, passes: 1 });
  part(P, T(D.ell(4.6, -7.8, 1.3, 0.45, 0.5)), C.forest, { nib: 0.08, passes: 1 });
  return elementBBox('panda', cx, by, s);
}

// Bamboo steamer basket with 3 pleated dumplings & steam
function dumplings(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  // Bamboo steamer base
  part(P, T([[-8.2, -4.4], [8.2, -4.4], [7.6, 0], [-7.6, 0]]), C.ochre, { nib: 0.18 });
  P.ink(T([[-8.0, -2.2], [8.0, -2.2]]), { nib: 0.12, color: C.brown });
  // Rim ellipse
  part(P, T(D.ell(0, -4.4, 8.2, 2.2)), '#d9ba7b', { nib: 0.16 });
  // Three pleated white steamed dumplings (baozi/xiaolongbao)
  for (const [dx, dy] of [[-3.4, -5.2], [3.4, -5.2], [0, -6.2]]) {
    part(P, T(D.ell(dx, dy, 2.8, 2.1)), C.paper, { nib: 0.15, pressure: 0.35 });
    P.ink(T([[dx - 0.8, dy - 1.2], [dx, dy - 1.9], [dx + 0.8, dy - 1.2]]), { nib: 0.1, color: C.slate });
  }
  // Rising steam wisps
  for (const sx of [-2.8, 0, 2.8]) {
    P.curve(T([[sx, -8.2], [sx + 0.6, -9.6], [sx - 0.5, -11.2]]), { nib: 0.11, color: '#7a7378' });
  }
  return elementBBox('dumplings', cx, by, s);
}

// Clay teapot with curved spout, handle, lid, teacup & steam
function teapot(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  const col = o.color || C.terracotta;
  // Curved spout on left
  P.curve(T([[-4.2, -3.2], [-6.8, -4.4], [-8.0, -7.4]]), { nib: 0.55 * s, color: col });
  P.curve(T([[-4.2, -3.2], [-6.8, -4.4], [-8.0, -7.4]]), { nib: 0.14, color: C.ink });
  // Curved handle on right
  P.curve(T([[3.8, -6.4], [6.8, -5.6], [6.4, -2.6], [3.6, -2.0]]), { nib: 0.38 * s, color: col });
  P.curve(T([[3.8, -6.4], [6.8, -5.6], [6.4, -2.6], [3.6, -2.0]]), { nib: 0.12, color: C.ink });
  // Rounded clay body
  part(P, T(D.ell(-0.4, -4.0, 4.6, 3.8)), col, { nib: 0.18, shade: T([[1.2, -8], [5, -8], [5, 0], [1.2, 0]]), hatch: 75 });
  // Lid & knob
  part(P, T(D.ell(-0.4, -7.6, 2.6, 0.9)), col, { nib: 0.14 });
  part(P, T(D.ell(-0.4, -8.8, 0.75, 0.65)), col, { nib: 0.12 });
  // Small teacup beside pot
  part(P, T([[5.4, -2.6], [8.8, -2.6], [8.2, 0], [6.0, 0]]), C.cream, { nib: 0.14 });
  part(P, T(D.ell(7.1, -2.6, 1.7, 0.5)), C.matcha, { nib: 0.08, passes: 1 });
  // Steam from spout
  P.curve(T([[-7.8, -8.2], [-7.2, -9.8], [-8.0, -11.2]]), { nib: 0.11, color: '#7a7378' });
  return elementBBox('teapot', cx, by, s);
}

// =========================================================================
// --- EUROPE (7 new elements) ---
// =========================================================================

// Gothic cathedral with twin spires, rose window & pointed portal
function cathedral(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  const col = o.wall || STONE;
  // Central nave facade
  part(P, T([[-5.0, -13.5], [5.0, -13.5], [5.0, 0], [-5.0, 0]]), col, { nib: 0.18 });
  // Twin flanking towers
  for (const sd of [-1, 1]) {
    part(P, T([[sd * 4.6, -16.8], [sd * 9.6, -16.8], [sd * 9.8, 0], [sd * 4.6, 0]]), col, { nib: 0.18 });
    // Steep Gothic spires
    part(P, T([[sd * 4.4, -16.8], [sd * 7.1, -22.2], [sd * 9.8, -16.8]]), o.roof || TILE, { nib: 0.16 });
    // Finial cross
    P.ink(T([[sd * 7.1, -22.2], [sd * 7.1, -23.3]]), { nib: 0.13 });
    P.ink(T([[sd * 6.5, -22.8], [sd * 7.7, -22.8]]), { nib: 0.11 });
    // Tall lancet windows
    part(P, T([[sd * 6.4, -13.2], [sd * 7.8, -13.2], [sd * 7.8, -9.4], [sd * 6.4, -9.4]]), C.navy, { nib: 0.1, passes: 1 });
  }
  // Central gable
  part(P, T([[-4.6, -13.5], [0, -16.6], [4.6, -13.5]]), col, { nib: 0.16 });
  // Rose window
  part(P, T(D.ell(0, -9.6, 2.3, 2.3)), C.navy, { nib: 0.14 });
  part(P, T(D.ell(0, -9.6, 1.0, 1.0)), C.gold, { nib: 0.08, passes: 1 });
  // Pointed portal
  part(P, T([[-2.2, 0], [-2.2, -3.4], [0, -5.2], [2.2, -3.4], [2.2, 0]]), C.ink, { nib: 0.14 });
  return elementBBox('cathedral', cx, by, s);
}

// Fairytale European castle / chateau with conical turrets & pennants
function europeanCastle(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  const roofCol = o.roof || C.navy;
  const wallCol = o.wall || C.cream;
  // Central tall keep
  part(P, T([[-4.2, -14.8], [4.2, -14.8], [4.6, -7.2], [-4.6, -7.2]]), wallCol, { nib: 0.16 });
  part(P, T([[-5.0, -14.8], [0, -19.2], [5.0, -14.8]]), roofCol, { nib: 0.18 });
  P.ink(T([[0, -19.2], [0, -20.3]]), { nib: 0.13 });
  part(P, T([[0, -20.3], [2.4, -19.8], [0, -19.3]]), C.crimson, { nib: 0.08, passes: 1 });
  // Curtain wall
  part(P, T([[-9.2, -8.4], [9.2, -8.4], [9.6, 0], [-9.6, 0]]), wallCol, { nib: 0.18, shade: T([[2, -9], [10, -9], [10, 0.2], [2, 0.2]]), hatch: 75 });
  // Crenellations on curtain wall
  for (const cx0 of [-4.2, -1.4, 1.4, 4.2]) {
    part(P, T([[cx0 - 0.8, -9.5], [cx0 + 0.8, -9.5], [cx0 + 0.8, -8.4], [cx0 - 0.8, -8.4]]), wallCol, { nib: 0.1 });
  }
  // Twin corner turrets with conical roofs
  for (const sd of [-1, 1]) {
    part(P, T([[sd * 6.8, -12.6], [sd * 11.4, -12.6], [sd * 11.8, 0], [sd * 6.4, 0]]), wallCol, { nib: 0.18 });
    part(P, T([[sd * 6.0, -12.6], [sd * 9.1, -17.4], [sd * 12.2, -12.6]]), roofCol, { nib: 0.16 });
    part(P, T([[sd * 9.1, -18.2], [sd * 9.1 + 1.8, -17.8], [sd * 9.1, -17.4]]), C.vermilion, { nib: 0.08, passes: 1 });
  }
  // Arched castle gate
  part(P, T([[-2.2, 0], [-2.2, -3.4], [0, -4.8], [2.2, -3.4], [2.2, 0]]), C.wood, { nib: 0.14 });
  return elementBBox('europeanCastle', cx, by, s);
}

// Traditional European windmill with tapered tower & 4 lattice timber sails
function windmill(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  // Tapered tower body
  part(P, T([[-3.6, -12.2], [3.6, -12.2], [5.4, 0], [-5.4, 0]]), o.wall || C.cream, { nib: 0.18, shade: T([[1, -13], [6, -13], [6, 0.2], [1, 0.2]]), hatch: 72 });
  // Dome cap
  part(P, T(D.curve([[-4.0, -12.0], [-3.2, -14.6], [0, -15.4], [3.2, -14.6], [4.0, -12.0]], true, 0.4)), o.roof || C.terracotta, { nib: 0.16 });
  // Arched wooden door & small window
  part(P, T([[-1.4, 0], [-1.4, -3.0], [0, -4.0], [1.4, -3.0], [1.4, 0]]), C.wood, { nib: 0.12 });
  part(P, T([[-1.0, -8.2], [1.0, -8.2], [1.0, -6.4], [-1.0, -6.4]]), C.oceanDeep, { nib: 0.1, passes: 1 });
  // 4 diagonal lattice sails centered at (0, -13.0)
  const hubY = -13.0;
  for (const ang of [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const px = -sa;
    const py = ca;
    const len = 8.4;
    const sail = [
      [ca * 1.4, hubY + sa * 1.4],
      [ca * len, hubY + sa * len],
      [ca * len + px * 2.0, hubY + sa * len + py * 2.0],
      [ca * 1.8 + px * 1.6, hubY + sa * 1.8 + py * 1.6],
    ];
    part(P, T(sail), C.paper, { nib: 0.13, pressure: 0.35 });
    P.ink(T([[0, hubY], [ca * len, hubY + sa * len]]), { nib: 0.2 * s, color: C.brown });
  }
  part(P, T(D.ell(0, hubY, 0.9, 0.9)), C.brown, { nib: 0.12 });
  return elementBBox('windmill', cx, by, s);
}

// Classical Roman triumphal arch with attic, cornice & vaulted opening
function romanArch(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  const col = o.color || STONE;
  // Main arch body with central semicircular vault cut out
  const archPts = [
    [-9.4, 0], [-9.4, -10.8], [9.4, -10.8], [9.4, 0],
    [3.4, 0], [3.4, -4.6], [2.6, -6.8], [1.2, -7.8], [0, -8.1], [-1.2, -7.8], [-2.6, -6.8], [-3.4, -4.6], [-3.4, 0],
  ];
  part(P, T(archPts), col, { nib: 0.18, shade: T([[3.4, -11], [10, -11], [10, 0.2], [3.4, 0.2]]), hatch: 75 });
  // Projecting cornice & stepped attic
  part(P, T([[-10.2, -11.8], [10.2, -11.8], [10.2, -10.6], [-10.2, -10.6]]), col, { nib: 0.16 });
  part(P, T([[-8.8, -14.4], [8.8, -14.4], [8.8, -11.8], [-8.8, -11.8]]), col, { nib: 0.16 });
  // Inscribed tablet in attic
  part(P, T([[-4.2, -13.6], [4.2, -13.6], [4.2, -12.4], [-4.2, -12.4]]), C.cream, { nib: 0.1, passes: 1 });
  // Pilaster fluting lines & medallions
  for (const px of [-7.6, -5.0, 5.0, 7.6]) {
    P.ink(T([[px, -10.4], [px, -0.4]]), { nib: 0.12, color: '#8a8272' });
  }
  part(P, T(D.ell(-6.3, -6.2, 1.0, 1.0)), C.ochre, { nib: 0.1, passes: 1 });
  part(P, T(D.ell(6.3, -6.2, 1.0, 1.0)), C.ochre, { nib: 0.1, passes: 1 });
  return elementBBox('romanArch', cx, by, s);
}

// Timber trellis vineyard with leafy canopy & purple grape clusters
function vineyard(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  // Trellis wooden posts & crossbars
  for (const px of [-7.4, 0, 7.4]) {
    part(P, T([[px - 0.6, -9.8], [px + 0.6, -9.8], [px + 0.6, 0], [px - 0.6, 0]]), C.wood, { nib: 0.13 });
  }
  P.ink(T([[-9.2, -8.4], [9.2, -8.4]]), { nib: 0.22 * s, color: C.brown });
  P.ink(T([[-9.2, -4.8], [9.2, -4.8]]), { nib: 0.16, color: C.brown });
  // Leafy vine canopy
  const canopy = T(D.curve([[-9.4, -7.2], [-8.2, -10.8], [-3.0, -11.4], [3.0, -11.4], [8.2, -10.8], [9.4, -7.2], [4.0, -6.2], [-4.0, -6.2]], true, 0.4));
  part(P, canopy, C.forest, { nib: 0.16 });
  // Three hanging purple grape clusters
  for (const gx of [-4.2, 0.2, 4.4]) {
    for (const [dx, dy] of [[-0.8, -6.4], [0.8, -6.4], [0, -6.2], [-0.5, -5.1], [0.5, -5.1], [0, -4.0]]) {
      part(P, T(D.ell(gx + dx, dy, 0.72, 0.72)), '#6b4c7a', { nib: 0.08, passes: 1 });
    }
  }
  return elementBBox('vineyard', cx, by, s);
}

// Gnarled Mediterranean olive tree with silvery-sage crown & dark olives
function oliveTree(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  // Gnarled twisted trunk
  const trunk = T(D.curve([[-2.0, 0], [-1.6, -2.6], [-2.2, -5.4], [-0.4, -6.4], [1.6, -5.4], [1.4, -2.4], [2.2, 0]], true, 0.4));
  part(P, trunk, C.wood, { nib: 0.16 });
  // Silvery-sage Mediterranean foliage clouds
  const leafCol = o.color || '#8ea682';
  part(P, T(D.ell(-3.6, -8.6, 3.6, 2.7)), leafCol, { nib: 0.15 });
  part(P, T(D.ell(3.6, -8.4, 3.6, 2.6)), leafCol, { nib: 0.15 });
  part(P, T(D.ell(0, -10.4, 4.4, 2.9)), leafCol, { nib: 0.16, shade: T([[1.5, -13.5], [7.5, -13.5], [7.5, -5], [1.5, -5]]), hatch: 75 });
  // Tiny dark olives dotted through crown
  for (const [ox, oy] of [[-4.2, -8.4], [-1.4, -10.6], [1.6, -9.8], [4.0, -8.0], [0.2, -7.8]]) {
    P.dot(...T([[ox, oy]])[0], 0.38 * s, '#363b2d');
  }
  return elementBBox('oliveTree', cx, by, s);
}

// European gastronomy icon: wine bottle, stemmed glass & golden cheese wedge
function cheeseWine(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  // Dark green wine bottle (left)
  part(P, T([[-6.8, -7.6], [-5.2, -9.2], [-5.2, -13.0], [-3.4, -13.0], [-3.4, -9.2], [-1.8, -7.6], [-1.8, 0], [-6.8, 0]]), C.forestDark, { nib: 0.16 });
  part(P, T([[-6.4, -6.2], [-2.2, -6.2], [-2.2, -2.4], [-6.4, -2.4]]), C.cream, { nib: 0.1, passes: 1 });
  part(P, T([[-5.2, -13.2], [-3.4, -13.2], [-3.4, -11.8], [-5.2, -11.8]]), C.crimson, { nib: 0.08, passes: 1 });
  // Stemmed red wine glass (center)
  P.ink(T([[0.8, 0], [0.8, -4.4]]), { nib: 0.18 * s, color: C.ink });
  P.ink(T([[-0.6, 0], [2.2, 0]]), { nib: 0.16, color: C.ink });
  part(P, T(D.curve([[-1.0, -8.4], [-1.0, -5.8], [0.8, -4.4], [2.6, -5.8], [2.6, -8.4]], true, 0.4)), C.paper, { nib: 0.14, pressure: 0.25 });
  part(P, T(D.curve([[-0.8, -6.6], [0.8, -4.6], [2.4, -6.6]], true, 0.4)), C.crimson, { nib: 0.1, passes: 1 });
  // Golden cheese wedge with holes (right)
  part(P, T([[1.8, -3.4], [7.8, -3.4], [7.8, 0], [1.8, 0]]), C.gold, { nib: 0.16 });
  part(P, T([[1.8, -3.4], [5.4, -5.8], [7.8, -3.4]]), '#f2d06b', { nib: 0.14 });
  for (const [hx, hy, hr] of [[3.6, -1.6, 0.65], [6.0, -2.0, 0.55], [4.8, -0.8, 0.45]]) {
    part(P, T(D.ell(hx, hy, hr, hr * 0.85)), C.ochre, { nib: 0.08, passes: 1 });
  }
  return elementBBox('cheeseWine', cx, by, s);
}

// =========================================================================
// --- UNIVERSAL NATURE, MARINE & TRANSPORT (8 new elements) ---
// =========================================================================

// Tropical palm tree with curved segmented trunk, 6 fronds & coconuts
function palmTree(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  // Curved trunk
  const trunk = T([[-2.2, 0], [-1.4, -4.8], [-0.2, -9.2], [1.2, -12.4], [2.4, -12.0], [1.2, -8.8], [0.2, -4.6], [-0.4, 0]]);
  part(P, trunk, C.wood, { nib: 0.16 });
  for (const [x0, y0, x1, y1] of [[-1.6, -2.6, -0.1, -2.4], [-1.0, -5.4, 0.5, -5.2], [-0.2, -8.2, 1.3, -8.0]]) {
    P.ink(T([[x0, y0], [x1, y1]]), { nib: 0.1, color: C.brown });
  }
  // Six arching palm fronds radiating from crown (1.6, -12.4)
  const leafCol = o.color || C.forest;
  const fronds = [
    [[1.6, -12.4], [-2.5, -14.2], [-7.8, -11.4], [-3.2, -12.0]],
    [[1.6, -12.4], [-1.4, -16.0], [-6.2, -15.6], [-1.8, -14.0]],
    [[1.6, -12.4], [0.8, -16.2], [4.4, -16.0], [2.2, -14.0]],
    [[1.6, -12.4], [5.4, -14.8], [9.2, -12.2], [5.0, -12.6]],
    [[1.6, -12.4], [5.6, -11.4], [8.2, -8.2], [4.6, -10.2]],
    [[1.6, -12.4], [-2.2, -11.2], [-5.2, -8.2], [-1.6, -10.2]],
  ];
  for (const f of fronds) {
    part(P, T(D.curve(f, true, 0.4)), leafCol, { nib: 0.13 });
  }
  // Two brown coconuts under the crown
  part(P, T(D.ell(0.8, -11.4, 0.9, 0.85)), C.brown, { nib: 0.1 });
  part(P, T(D.ell(2.3, -11.3, 0.9, 0.85)), C.brown, { nib: 0.1 });
  return elementBBox('palmTree', cx, by, s);
}

// Active volcano with dark steep cone, glowing crater & smoke plume
function volcano(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  // Billowing smoke plume behind crater
  part(P, T(D.ell(1.4, -15.6, 4.0, 2.4)), '#b8b2aa', { nib: 0.14, pressure: 0.55 });
  part(P, T(D.ell(-1.6, -16.6, 3.0, 2.0)), '#ccc6be', { nib: 0.14, pressure: 0.5 });
  part(P, T(D.ell(4.6, -16.8, 2.8, 1.8)), '#ccc6be', { nib: 0.13, pressure: 0.45 });
  // Steep volcanic cone
  const cone = T(D.curve([[-14.0, 0], [-8.0, -5.0], [-3.2, -12.6], [3.2, -12.6], [8.0, -5.0], [14.0, 0]], true, 0.4));
  part(P, cone, o.color || '#5e5854', { nib: 0.2, shade: T([[1.5, -13], [14.5, -13], [14.5, 0.5], [1.5, 0.5]]), hatch: 68 });
  // Glowing red-orange lava crater & drips
  const lava = T([[-3.2, -12.6], [3.2, -12.6], [4.4, -9.8], [2.4, -10.8], [1.2, -8.4], [-0.4, -10.8], [-2.2, -9.2], [-4.2, -10.6]]);
  part(P, lava, C.vermilion, { nib: 0.14 });
  part(P, T(D.ell(0, -12.6, 2.8, 0.8)), C.orange, { nib: 0.1, passes: 1 });
  return elementBBox('volcano', cx, by, s);
}

// Twin rocky cliffs with cascading waterfall & foamy splash pool
function waterfall(P, cx, by, s = 1) {
  const T = at(cx, by, s);
  // Left & right rocky cliff flanks
  part(P, T([[-10.2, 0], [-10.2, -11.4], [-6.8, -14.0], [-3.4, -13.6], [-3.6, -2.0]]), C.slate, { nib: 0.18 });
  part(P, T([[3.4, -13.6], [6.8, -14.0], [10.2, -11.4], [10.2, 0], [3.6, -2.0]]), C.slate, { nib: 0.18, shade: T([[5, -14.2], [10.5, -14.2], [10.5, 0.2], [5, 0.2]]), hatch: 72 });
  // Cascading blue water curtain
  part(P, T([[-3.6, -13.4], [3.6, -13.4], [4.2, -1.6], [-4.2, -1.6]]), C.river, { nib: 0.16 });
  // White vertical foam streaks
  for (const wx of [-2.0, 0, 2.0]) {
    P.ink(T([[wx, -13.0], [wx, -2.4]]), { nib: 0.24 * s, color: C.paper });
  }
  // Splash pool & foam clouds at base
  part(P, T(D.ell(0, -1.0, 7.6, 1.6)), C.ocean, { nib: 0.14 });
  for (const [fx, fy, fr] of [[-3.2, -1.8, 1.4], [0, -2.2, 1.8], [3.2, -1.8, 1.4]]) {
    part(P, T(D.ell(fx, fy, fr, fr * 0.72)), C.paper, { nib: 0.1, pressure: 0.3, passes: 1 });
  }
  return elementBBox('waterfall', cx, by, s);
}

// Classic steam locomotive with boiler, cab, red wheels, smokestack & steam
function train(P, cx, by, s = 1, a = 0, o = {}) {
  const T = at(cx, by, s, a);
  const bodyCol = o.body || C.navy;
  // Track line
  P.ink(T([[-12.6, 0.5], [13.0, 0.5]]), { nib: 0.16, color: C.slate });
  // Steam puffs from stack
  part(P, T(D.ell(4.6, -10.0, 1.8, 1.2)), '#d9d6cf', { nib: 0.1, pressure: 0.35, passes: 1 });
  part(P, T(D.ell(1.4, -10.6, 1.4, 0.9)), '#d9d6cf', { nib: 0.09, pressure: 0.3, passes: 1 });
  // Smokestack
  part(P, T([[5.6, -9.2], [7.8, -9.2], [7.3, -6.2], [6.1, -6.2]]), C.ink, { nib: 0.14 });
  // Boiler cylinder
  part(P, T(D.rrect(-3.6, -6.6, 9.2, -2.2, 0.8)), bodyCol, { nib: 0.18 });
  // Brass dome
  part(P, T(D.ell(2.4, -6.8, 1.2, 0.9)), C.gold, { nib: 0.11 });
  // Driver cab (left)
  part(P, T([[-10.4, -8.8], [-3.4, -8.8], [-3.4, -2.2], [-10.4, -2.2]]), o.cab || C.crimson, { nib: 0.18 });
  part(P, T([[-11.2, -9.4], [-2.6, -9.4], [-2.6, -8.6], [-11.2, -8.6]]), C.ink, { nib: 0.14 });
  part(P, T([[-8.8, -7.6], [-5.2, -7.6], [-5.2, -5.2], [-8.8, -5.2]]), C.cream, { nib: 0.11, passes: 1 });
  // Cowcatcher (right)
  part(P, T([[9.2, -2.4], [12.4, -0.4], [9.2, -0.4]]), C.crimson, { nib: 0.14 });
  // Red spoked wheels
  for (const [wx, wr] of [[-7.2, 2.0], [-2.2, 2.0], [3.0, 1.5], [7.4, 1.5]]) {
    part(P, T(D.ell(wx, -wr, wr, wr)), C.vermilion, { nib: 0.14 });
    P.dot(...T([[wx, -wr]])[0], 0.35 * s, C.gold);
  }
  return elementBBox('train', cx, by, s, a);
}

// Multi-masted historic sailing ship with billowing square sails
function ship(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  const sailCol = o.sail || C.cream;
  // Masts
  P.ink(T([[-3.2, -4.4], [-3.2, -16.0]]), { nib: 0.2 * s, color: C.brown });
  P.ink(T([[2.4, -4.4], [2.4, -17.6]]), { nib: 0.22 * s, color: C.brown });
  // Top pennant
  part(P, T([[2.4, -18.2], [6.4, -17.4], [2.4, -16.8]]), C.vermilion, { nib: 0.1, passes: 1 });
  // Billowing square sails
  part(P, T(D.curve([[-6.4, -14.6], [-0.4, -14.6], [0.4, -11.4], [-5.6, -11.4]], true, 0.4)), sailCol, { nib: 0.14 });
  part(P, T(D.curve([[-7.0, -10.8], [0.0, -10.8], [0.8, -6.2], [-6.2, -6.2]], true, 0.4)), sailCol, { nib: 0.15 });
  part(P, T(D.curve([[-0.8, -15.6], [6.0, -15.6], [6.8, -11.8], [0.0, -11.8]], true, 0.4)), sailCol, { nib: 0.14 });
  part(P, T(D.curve([[-1.2, -11.2], [6.6, -11.2], [7.6, -6.2], [-0.2, -6.2]], true, 0.4)), sailCol, { nib: 0.15 });
  // Bowsprit
  P.ink(T([[8.2, -4.6], [12.0, -7.2]]), { nib: 0.16, color: C.brown });
  // Timber hull with raised stern castle
  const hull = T([[-10.4, -6.2], [-6.4, -6.2], [-5.6, -4.2], [9.6, -4.2], [7.2, 0], [-8.0, 0]]);
  part(P, hull, o.hull || C.wood, { nib: 0.2, shade: T([[0, -5], [10, -5], [10, 0.2], [0, 0.2]]), hatch: 75 });
  // Waterline
  P.ink(T([[-12.0, 0.5], [12.0, 0.5]]), { nib: 0.14, color: '#6b93a8' });
  return elementBBox('ship', cx, by, s);
}

// Striped hot air balloon with suspension ropes & wicker basket
function hotAirBalloon(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  const col = o.color || C.vermilion;
  const stripeCol = o.stripe || C.gold;
  // Suspension ropes
  P.ink(T([[-2.0, -6.2], [-1.4, -3.2]]), { nib: 0.12, color: C.brown });
  P.ink(T([[2.0, -6.2], [1.4, -3.2]]), { nib: 0.12, color: C.brown });
  // Wicker basket
  part(P, T([[-1.8, -3.2], [1.8, -3.2], [1.5, 0], [-1.5, 0]]), C.wood, { nib: 0.14 });
  // Teardrop balloon envelope
  const env = T(D.curve([[0, -20.2], [5.2, -18.4], [6.8, -13.6], [4.6, -8.8], [2.2, -6.2], [-2.2, -6.2], [-4.6, -8.8], [-6.8, -13.6], [-5.2, -18.4]], true, 0.4));
  part(P, env, col, { nib: 0.18 });
  // Decorative horizontal & vertical stripes
  const midStripe = T([[-6.4, -14.4], [6.4, -14.4], [6.0, -11.6], [-6.0, -11.6]]);
  part(P, midStripe, stripeCol, { nib: 0.12 });
  P.curve(T([[0, -20.0], [-2.6, -13.6], [-1.2, -6.4]]), { nib: 0.12, color: C.ink });
  P.curve(T([[0, -20.0], [2.6, -13.6], [1.2, -6.4]]), { nib: 0.12, color: C.ink });
  return elementBBox('hotAirBalloon', cx, by, s);
}

// Decorative swimming/leaping fish with dorsal fin, tail & scale arcs
function fish(P, cx, cy, s = 1, a = 0, o = {}) {
  const T = at(cx, cy, s, a);
  const col = o.color || C.oceanDeep;
  // Dorsal & ventral fins
  part(P, T([[-2.2, -2.0], [0.4, -4.0], [2.8, -1.8]]), o.fin || C.ochre, { nib: 0.12 });
  part(P, T([[-0.6, 2.0], [1.2, 3.8], [2.4, 1.8]]), o.fin || C.ochre, { nib: 0.12 });
  // Streamlined fish body + forked tail
  const body = T(D.curve([[-7.2, 0], [-4.2, -2.6], [1.2, -2.4], [5.2, -0.5], [8.2, -2.8], [7.0, 0], [8.2, 2.8], [5.2, 0.5], [1.2, 2.4], [-4.2, 2.6]], true, 0.4));
  part(P, body, col, { nib: 0.18 });
  // Gill & scale arcs
  P.curve(T([[-3.4, -1.6], [-2.4, 0], [-3.4, 1.6]]), { nib: 0.12, color: C.paper });
  for (const sx of [-1.0, 1.2]) {
    P.curve(T([[sx, -1.1], [sx + 0.7, 0], [sx, 1.1]]), { nib: 0.1, color: C.paper });
  }
  // Eye
  part(P, T(D.ell(-5.0, -0.5, 0.65, 0.65)), C.paper, { nib: 0.08, passes: 1 });
  P.dot(...T([[-5.1, -0.5]])[0], 0.3 * s, C.ink);
  return elementBBox('fish', cx, cy, s, a);
}

// Central Asian / Mongolian felt yurt (ger) with decorative band, dome & smoke
function yurt(P, cx, by, s = 1, o = {}) {
  const T = at(cx, by, s);
  const wallCol = o.wall || C.cream;
  // Circular felt wall
  part(P, T([[-9.0, -5.8], [9.0, -5.8], [9.2, 0], [-9.2, 0]]), wallCol, { nib: 0.18, shade: T([[2.5, -6], [9.4, -6], [9.4, 0.2], [2.5, 0.2]]), hatch: 75 });
  // Conical dome roof
  const roof = T(D.curve([[-9.2, -5.6], [-5.2, -8.8], [0, -10.4], [5.2, -8.8], [9.2, -5.6]], true, 0.4));
  part(P, roof, o.roof || C.paper, { nib: 0.18, pressure: 0.4 });
  // Crimson decorative band & door
  part(P, T([[-9.0, -6.2], [9.0, -6.2], [9.0, -5.0], [-9.0, -5.0]]), o.accent || C.crimson, { nib: 0.11 });
  part(P, T([[-2.0, -4.8], [2.0, -4.8], [2.0, 0], [-2.0, 0]]), o.accent || C.crimson, { nib: 0.14 });
  part(P, T([[-1.2, -4.0], [1.2, -4.0], [1.2, -0.6], [-1.2, -0.6]]), C.ochre, { nib: 0.09, passes: 1 });
  // Crown ring (toono) & gentle hearth smoke
  part(P, T(D.ell(0, -10.2, 2.0, 0.65)), C.wood, { nib: 0.12 });
  P.curve(T([[0, -10.5], [0.8, -11.4], [-0.4, -12.3]]), { nib: 0.11, color: '#7a7378' });
  return elementBBox('yurt', cx, by, s);
}

const ELEMENTS = {
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
  palaceGate,
  hillTower,
  hanok,
  onggi,
  bibimbap,
  gimbap,
  dolHareubang,
  mugunghwa,
  turtleShip,
  stoneObservatory,
  tiger,
  crab,
  tangerine,
  hahoeMask,
  hanbok,
  pavilion,
  greatWall,
  archBridge,
  lantern,
  panda,
  dumplings,
  teapot,
  cathedral,
  europeanCastle,
  windmill,
  romanArch,
  vineyard,
  oliveTree,
  cheeseWine,
  palmTree,
  volcano,
  waterfall,
  train,
  ship,
  hotAirBalloon,
  fish,
  yurt,
};

// Attach metadata & bbox helper as non-enumerable properties so Object.keys(EL)
// remains strictly the 65 drawable element functions (backward compatible with
// map.el wrapping and test/createMap.test.js).
Object.defineProperties(ELEMENTS, {
  ELEMENT_BOUNDS: { value: ELEMENT_BOUNDS, enumerable: false },
  ELEMENT_META: { value: ELEMENT_META, enumerable: false },
  elementBBox: { value: elementBBox, enumerable: false },
});

module.exports = ELEMENTS;
