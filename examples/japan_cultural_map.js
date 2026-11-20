'use strict';
const path = require('path');
const { createMap, PALETTE: C } = require('../src');
const G = require('../src/japanGeo');

async function main() {
  // Authentic double-page cartographic atlas spread (300mm x 200mm)
  const map = createMap({
    id: 'japan-cartographic-atlas',
    w: 300,
    h: 200,
    seed: 'atlas-japan-map-v3',
    paper: 'hotpress',
    ocean: '#cde0e6',
    pad: 4.8,
    inner: 8.0,
  });

  // 26° Oblique Conformal-like Atlas Projection (fits Kyushu -> Hokkaido generously across the spread)
  const proj = map.createProjection({
    lon0: 137.6,
    lat0: 38.2,
    cx: 160,
    cy: 100,
    scale: 0.140,
    rotDeg: 26,
  });

  // =========================================================================
  // 1. CARTOGRAPHIC GRATICULE GRID (Latitude & Longitude curves)
  // =========================================================================
  map.graticule(proj, {
    lons: [126, 130, 134, 138, 142, 146],
    lats: [30, 34, 38, 42, 46],
  });

  // =========================================================================
  // 2. NEIGHBORING MAINLAND & REAL JAPANESE ARCHIPELAGO COASTLINES
  // =========================================================================
  const koreaPoly = map.D.curve(proj.pts(G.KOREA_MAINLAND), true, 0.20);
  const hokkaidoPoly = map.D.curve(proj.pts(G.HOKKAIDO), true, 0.22);
  const honshuPoly = map.D.curve(proj.pts(G.HONSHU), true, 0.22);
  const shikokuPoly = map.D.curve(proj.pts(G.SHIKOKU), true, 0.22);
  const kyushuPoly = map.D.curve(proj.pts(G.KYUSHU), true, 0.22);
  const smallPolys = G.SMALL_ISLANDS.map((isl) => map.D.curve(proj.pts(isl), true, 0.25));

  // Morphological bathymetric shallow-water collar + double coastal waterlines!
  map.coastWaterlines([koreaPoly, hokkaidoPoly, honshuPoly, shikokuPoly, kyushuPoly, ...smallPolys]);

  // Neighboring Korean Peninsula / Mainland in muted antique parchment-grey
  map.part(koreaPoly, C.neighborLand, { pressure: 0.55, passes: 2, blunt: true, nib: 0.26, outlineColor: '#5c5549' });
  const [kx, ky] = proj(128.0, 36.3);
  map.regionLabel('KOREA', kx, ky, { size: 3.1, color: '#6e6658' });
  const [bx, by] = proj(129.07, 35.18);
  map.city(bx, by, 'Busan', { dx: -5.5, dy: -1.5, size: 2.0, color: '#5c5549' });

  // Main Japanese Islands in warm sunlit parchment tones
  map.part(hokkaidoPoly, C.landGreen, { pressure: 0.62, passes: 2, blunt: true, nib: 0.32 });
  map.part(honshuPoly, C.land, { pressure: 0.64, passes: 2, blunt: true, nib: 0.32 });
  map.part(shikokuPoly, C.landWarm, { pressure: 0.64, passes: 2, blunt: true, nib: 0.30 });
  map.part(kyushuPoly, C.land, { pressure: 0.64, passes: 2, blunt: true, nib: 0.30 });
  for (const sp of smallPolys) {
    map.part(sp, C.landWarm, { pressure: 0.60, passes: 1, nib: 0.22 });
  }

  // =========================================================================
  // 3. HYDROGRAPHY & TOPOGRAPHIC RELIEF (Lakes, Rivers, Mountain Spines)
  // =========================================================================
  // Lake Biwa (Shiga)
  map.part(map.D.curve(proj.pts(G.LAKE_BIWA), true, 0.25), C.lake, { nib: 0.15, passes: 1 });

  // Major Rivers (real geographic courses)
  map.river(proj.pts([[142.4, 43.7], [141.9, 43.2], [141.35, 43.22]]), { nib: 0.36 }); // Ishikari R.
  map.river(proj.pts([[141.2, 39.9], [141.15, 39.1], [141.30, 38.45]]), { nib: 0.36 }); // Kitakami R.
  map.river(proj.pts([[138.2, 36.2], [138.5, 36.9], [138.9, 37.5], [139.05, 37.92]]), { nib: 0.40 }); // Shinano R.
  map.river(proj.pts([[139.0, 36.6], [139.6, 36.1], [140.3, 35.9], [140.82, 35.74]]), { nib: 0.38 }); // Tone R.
  map.river(proj.pts([[135.95, 35.0], [135.7, 34.85], [135.48, 34.68]]), { nib: 0.34 }); // Yodo R.
  map.river(proj.pts([[131.1, 33.2], [130.65, 33.32], [130.35, 33.20]]), { nib: 0.32 }); // Chikugo R.

  // Helper to place mountain chains using (lon, lat)
  const geoPeaks = (list) => list.map(([lon, lat, w, h, snow]) => {
    const [px, py] = proj(lon, lat);
    return [px, py, w, h, snow];
  });

  // Daisetsuzan & Hidaka Mountains (Hokkaido)
  map.mountainRange(geoPeaks([
    [142.6, 43.9, 5.8, 6.8, true],
    [143.0, 43.6, 6.5, 7.8, true],
    [142.8, 42.8, 5.5, 6.2, false],
    [143.9, 43.5, 5.2, 6.0, true],
  ]));

  // Ou Mountain Spine (Tohoku)
  map.mountainRange(geoPeaks([
    [140.8, 40.3, 5.2, 6.0, false],
    [140.8, 39.6, 5.8, 6.8, true],
    [140.6, 38.9, 5.5, 6.4, true],
    [140.2, 38.0, 5.2, 6.0, false],
    [139.8, 37.2, 5.2, 6.0, false],
  ]));

  // Japanese Alps (Hida, Kiso, Akaishi in Chubu)
  map.mountainRange(geoPeaks([
    [137.6, 36.5, 6.2, 7.6, true],
    [137.8, 36.0, 6.8, 8.2, true],
    [138.2, 35.6, 6.2, 7.5, true],
    [137.4, 35.6, 5.4, 6.2, false],
  ]));

  // Chugoku, Shikoku & Kyushu Mountains
  map.mountainRange(geoPeaks([
    [133.6, 35.1, 5.2, 5.5, false],
    [132.5, 34.8, 5.0, 5.2, false],
    [133.9, 33.8, 5.4, 5.8, false],
    [133.2, 33.6, 5.0, 5.4, false],
    [131.1, 32.88, 6.0, 6.8, false], // Mt. Aso!
    [130.9, 32.2, 5.0, 5.4, false],
  ]));

  // Smoke puff over Mt. Aso volcano in Kyushu!
  const [asoX, asoY] = proj(131.1, 32.88);
  map.P.curve([[asoX, asoY - 7.0], [asoX + 1.2, asoY - 9.5], [asoX - 0.6, asoY - 12.0]], { nib: 0.14, color: '#6e655f' });

  // Terraced Rice Fields & Forests in real agricultural basins
  map.riceFields(...proj(140.1, 39.2), 11, 4.8); // Akita / Shonai plain
  map.riceFields(...proj(138.9, 37.5), 11, 4.8); // Niigata Echigo plain
  map.el.pine(...proj(142.0, 44.3), 0.48);
  map.el.pine(...proj(143.6, 44.0), 0.45);
  map.el.pine(...proj(144.6, 43.8), 0.48);
  map.el.pine(...proj(141.4, 40.2), 0.44);
  map.el.bamboo(...proj(135.4, 35.2), 0.48); // Arashiyama / Tamba

  // =========================================================================
  // 4. RAILWAYS, SHIPPING ROUTES & SEA LABELS
  // =========================================================================
  // Shinkansen High-Speed Rail Line (Hakodate -> Aomori -> Sendai -> Tokyo -> Nagoya -> Kyoto -> Osaka -> Hiroshima -> Fukuoka -> Kagoshima)
  map.route(proj.pts([
    [140.73, 41.77], [140.74, 40.82], [141.15, 39.7], [140.87, 38.27],
    [139.76, 35.68], [138.4, 35.15], [136.90, 35.18], [135.76, 35.01],
    [135.50, 34.69], [133.9, 34.66], [132.45, 34.39], [130.95, 33.95],
    [130.40, 33.59], [130.55, 31.59],
  ]), { color: C.navy, nib: 0.19 });

  // Historic Kitamaebune Sea of Japan Maritime Route
  map.route(proj.pts([
    [140.4, 41.6], [139.2, 39.8], [137.8, 38.4], [135.8, 36.8], [132.2, 35.8], [130.5, 34.3],
  ]), { color: '#9e5847', nib: 0.15 });

  // Sea & Strait Names + Gentle Waves
  map.seaLabel('SEA OF JAPAN', 124, 67, { size: 3.5 });
  map.seaLabel('PACIFIC OCEAN', 246, 129, { size: 3.5 });
  map.seaLabel('KOREA STRAIT', 52, 106, { size: 2.1, spacing: 0.10 });
  map.seaLabel('EAST CHINA SEA', 25, 178, { size: 2.3, spacing: 0.10 });
  map.regionLabel('HOKKAIDO', ...proj(142.8, 43.15), { size: 2.4 });
  map.regionLabel('HONSHU', ...proj(138.3, 36.5), { size: 2.4 });

  for (const [wx, wy, s] of [[104, 54, 0.72], [156, 66, 0.72], [86, 98, 0.68], [242, 86, 0.75], [164, 182, 0.72], [78, 178, 0.70]]) {
    map.waves(wx, wy, s, 2);
  }

  // =========================================================================
  // 5. GEOGRAPHICALLY ANCHORED LANDMARKS, CITIES & CULTURAL VIGNETTES
  // =========================================================================

  // --- HOKKAIDO (North) ---
  const [sapX, sapY] = proj(141.35, 43.06);
  map.el.house(sapX + 1, sapY - 2.2, 0.54, { roof: C.vermilion });
  map.city(sapX, sapY, 'Sapporo', { dy: 3.2, size: 2.4 });

  const [hakX, hakY] = proj(140.73, 41.77);
  map.city(hakX, hakY, 'Hakodate', { dx: -7.5, dy: 0.5, size: 2.0 });

  // Sapporo Miso Ramen right off Ishikari Bay
  map.el.foodBowl(196, 38, 0.72, { bowlColor: C.orange });
  map.label('Sapporo Ramen', 196, 42.2, { face: 'sans-bold', size: 2.0 });
  map.callout([204, 39], [sapX - 4, sapY - 3], { bendY: -2 });

  // Niseko / Otaru Skier waving
  map.person(219, 51, 0.46, {
    seed: 'niseko-skier', pose: 'wave', hair: 'short', hat: 'cap',
    capColor: C.crimson, shirt: { color: '#bcd6e6' }, look: 0.7, front: { r: true },
  });

  // Kushiro Red-crowned Crane in eastern Hokkaido
  const [kusX, kusY] = proj(144.38, 42.98);
  map.el.crane(kusX + 2, kusY - 3, 0.62);
  map.city(kusX, kusY, 'Kushiro', { dy: 3.0, size: 2.0 });
  map.label('Red-crowned Crane', kusX + 12, kusY + 7.5, { face: 'sans', size: 1.9 });

  // --- TOHOKU (Northeast Honshu) ---
  map.city(...proj(140.74, 40.82), 'Aomori', { dx: -6.5, dy: -1.2, size: 2.1 });
  map.city(...proj(140.87, 38.27), 'Sendai', { dx: 6.5, dy: 1.0, size: 2.2 });

  // Hot Spring Onsen in Tohoku mountains
  const [onsX, onsY] = proj(140.6, 39.2);
  map.el.onsen(onsX + 5, onsY + 2, 0.58);
  map.label('Onsen', onsX + 5, onsY + 5.5, { face: 'sans', size: 1.9 });

  // Koinobori streamers off Sanriku coast
  map.el.koinobori(228, 96, 0.78);
  map.label('Koinobori', 235, 100, { face: 'sans', size: 2.0 });

  // --- SEA OF JAPAN & HOKURIKU ---
  const [niiX, niiY] = proj(139.04, 37.92);
  map.city(niiX, niiY, 'Niigata', { dx: 5.5, dy: -1.5, size: 2.1 });
  // Sado label
  const [sadX, sadY] = proj(138.4, 38.05);
  map.label('Sado', sadX - 5, sadY - 2, { face: 'sans', size: 1.85, color: '#456473' });

  // Niigata Nishikigoi (Koi Carp) swimming in Sea of Japan off Niigata!
  map.el.koi(164, 84, 0.76, -0.2);
  map.el.koi(176, 80, 0.66, 0.18);
  map.label('Nishikigoi Carp', 170, 90.2, { face: 'sans', size: 1.95 });

  // Kitamaebune Sailboat on the Sea of Japan trade route
  map.el.sailboat(136, 86, 0.82);
  map.label('Kitamaebune Ship', 136, 90.2, { face: 'sans', size: 1.95 });

  // Kanazawa on Noto coast
  const [kanX, kanY] = proj(136.65, 36.56);
  map.city(kanX, kanY, 'Kanazawa', { dx: -8, dy: -1.5, size: 2.1 });

  // Takasaki Daruma Doll (Gunma / North Kanto)
  const [darX, darY] = proj(139.0, 36.4);
  map.el.daruma(darX, darY, 0.62);

  // --- KANTO & TOKYO BAY ---
  const [tokX, tokY] = proj(139.76, 35.68);
  map.el.tokyoTower(tokX + 5.5, tokY - 1.5, 0.58);
  map.city(tokX, tokY, 'Tokyo', { capital: true, dx: 9.5, dy: 4.2, size: 3.1 });

  // Ryogoku Sumo Ring & Edo Sushi anchored off Tokyo Bay / Boso!
  map.el.sumoRing(206, 142, 0.82);
  map.label('Sumo (Ryogoku)', 206, 146.5, { face: 'sans-bold', size: 2.0 });
  map.callout([193, 141], [tokX + 4, tokY + 0.5], { bendY: 1.5 });

  map.el.sushi(188, 161, 0.72);
  map.label('Edo Sushi', 188, 165.0, { face: 'sans-bold', size: 2.0 });

  map.el.shibaInu(168, 166, 0.74);
  map.label('Shiba Inu', 168, 170.0, { face: 'sans-bold', size: 2.0 });

  // --- CHUBU & MT. FUJI ---
  const [fujX, fujY] = proj(138.73, 35.36);
  map.el.mountain(fujX - 1.0, fujY + 0.5, 0.72, { snow: true });
  map.label('Mt. Fuji', fujX - 1.0, fujY + 4.4, { face: 'serif-bold', size: 2.15 });

  // Shizuoka Matcha Tea & Tokaido Shinkansen
  map.el.shinkansen(141, 156.5, 0.60, 0.14);
  map.label('Shinkansen', 140, 160.8, { face: 'sans-bold', size: 1.95, color: C.navy });

  map.el.matcha(147, 172, 0.70);
  map.label('Shizuoka Tea', 147, 176.0, { face: 'sans', size: 1.95 });

  const [nagX, nagY] = proj(136.90, 35.18);
  map.city(nagX, nagY, 'Nagoya', { dy: -2.5, size: 2.1 });

  // --- KANSAI (Kyoto, Nara, Osaka) ---
  const [kyoX, kyoY] = proj(135.76, 35.01);
  map.el.pagoda(kyoX + 1.5, kyoY - 2.0, 0.58);
  map.el.sakura(kyoX - 5.5, kyoY - 2.5, 0.48);
  map.city(kyoX, kyoY, 'Kyoto', { dx: 7.5, dy: -1.5, size: 2.3 });

  const [osaX, osaY] = proj(135.50, 34.69);
  map.el.castle(osaX - 5.0, osaY - 1.5, 0.50);
  map.city(osaX, osaY, 'Osaka', { dx: -6.5, dy: 3.8, size: 2.2 });

  const [narX, narY] = proj(135.83, 34.68);
  map.el.deer(narX + 4.5, narY + 5.5, 0.48);
  map.label('Nara Deer', narX + 5.5, narY + 9.0, { face: 'sans', size: 1.85 });

  // Kyoto / Kansai Hanami & Dango vignette off Kii coast
  map.el.sakura(105, 169, 0.58);
  map.person(115, 170, 0.50, { seed: 'kyoto-kimono', pose: 'stand', hair: 'bun', shirt: { color: C.sakura }, pants: 'white', look: 0.5 });
  map.el.dango(125, 169, 0.72);
  map.label('Kyoto Hanami & Dango', 116, 174.5, { face: 'sans', size: 2.0 });
  map.callout([115, 155], [osaX + 2, osaY + 5], { bendX: -2 });

  // --- CHUGOKU, SETO INLAND SEA & SHIKOKU ---
  const [hirX, hirY] = proj(132.45, 34.39);
  map.city(hirX, hirY, 'Hiroshima', { dx: 6.5, dy: -3.2, size: 2.2 });
  map.el.torii(hirX - 6.0, hirY + 5.2, 0.56);
  map.label('Miyajima', hirX - 13.5, hirY + 5.5, { face: 'sans', size: 1.85 });

  map.el.origamiCrane(92, 106, 0.78);
  map.label('Peace Origami', 92, 111.5, { face: 'sans', size: 1.95 });
  map.callout([88, 112], [hirX + 1, hirY - 4], { bendX: 2 });

  // Shikoku cities + Henro Pilgrim in conical straw hat!
  map.city(...proj(132.76, 33.84), 'Matsuyama', { dy: 3.4, size: 2.0 });
  const [kocX, kocY] = proj(133.53, 33.56);
  map.city(kocX, kocY, 'Kochi', { dx: 5.5, dy: 2.5, size: 2.0 });

  map.person(84, 164, 0.50, {
    seed: 'shikoku-pilgrim', pose: 'stand', hair: 'short',
    hat: 'conical', hatColor: C.ochre, shirt: { color: C.paper }, pants: 'white', look: 0.5,
  });
  map.el.onigiri(71, 163, 0.68);
  map.label('Shikoku Pilgrim', 79, 168.5, { face: 'sans', size: 2.0 });
  map.callout([82, 149], [kocX, kocY + 2], { bendX: 1 });

  // --- KYUSHU (Southwest) ---
  const [fukX, fukY] = proj(130.40, 33.59);
  map.city(fukX, fukY, 'Fukuoka', { dx: 6.5, dy: -2.0, size: 2.3 });

  const [ngsX, ngsY] = proj(129.87, 32.75);
  map.city(ngsX, ngsY, 'Nagasaki', { dx: -7.5, dy: -1.0, size: 2.0 });
  map.el.lighthouse(20, 142, 0.60);

  const [kagX, kagY] = proj(130.55, 31.59);
  map.city(kagX, kagY, 'Kagoshima', { dx: 8.5, dy: 2.5, size: 2.1 });

  // Hakata Ramen / Gyudon & Kyushu Chef
  map.el.foodBowl(25, 114, 0.72, { bowlColor: C.crimson });
  map.label('Hakata Ramen', 25, 118.2, { face: 'sans-bold', size: 2.0 });
  map.callout([33, 116], [fukX - 2, fukY - 1], { bendY: -1.5 });

  map.person(52, 168, 0.50, {
    seed: 'kyushu-chef', pose: 'raise', hair: 'bun', hat: 'cap',
    capColor: C.orange, shirt: { color: C.paper }, apron: C.navy, look: -0.5, front: { r: true },
  });
  map.label('Kyushu Chef', 52, 172.5, { face: 'sans', size: 1.95 });

  // Historic Dejima / Nagasaki Sailboat in East China Sea
  map.el.sailboat(20, 167, 0.76, { sail: C.paper, sail2: C.vermilion });

  // --- PACIFIC WHALE (Off Sanriku / Hokkaido Pacific shelf) ---
  map.el.whale(262, 112, 0.92);
  map.label('Pacific Whale', 262, 119.5, { face: 'sans', size: 2.0, color: '#426a80' });

  // =========================================================================
  // 6. CARTOGRAPHIC ORNAMENTS: PARCHMENT CARTOUCHE, COMPASS & OKINAWA INSET
  // =========================================================================

  // Top-Left Parchment Title, Facts, Legend & Scale Cartouche
  map.cartouche(13.5, 13.0, 88, 44, {
    country: 'JAPAN',
    subtitle: 'Nippon  ·  Archipelago of East Asia',
    flag: 'japan',
    capital: 'Tokyo',
    language: 'Japanese',
    population: '124 Million',
    area: '377,975 km2',
    mmPer100km: 14.0,
  });

  // True-North Aligned Compass Rose in the Pacific Ocean (rotated +26° to match meridians!)
  map.compass(203, 173, 8.2, {
    angle: proj.northAngle(141.5, 33.0),
    rhumb: true,
  });

  // Bottom-Right Framed Cartographic Inset Map: RYUKYU / OKINAWA ISLANDS
  map.insetBox(224, 136, 64, 51, 'RYUKYU / OKINAWA');
  // Islands inside inset: Amami, Okinawa Main Island, Miyako, Ishigaki
  const okiMain = map.D.curve([[252, 158], [259, 151], [262, 153], [255, 162], [251, 161]], true, 0.25);
  const amami = map.D.curve([[266, 144], [272, 141], [274, 144], [268, 147]], true, 0.25);
  const miyako = map.D.curve([[239, 171], [243, 170], [243, 173], [239, 173]], true, 0.25);
  const ishigaki = map.D.curve([[230, 175], [235, 173], [235, 177], [231, 178]], true, 0.25);
  map.coastWaterlines([okiMain, amami, miyako, ishigaki], { r1: 1.1, r2: 2.2 });
  for (const ip of [okiMain, amami, miyako, ishigaki]) {
    map.part(ip, C.landGreen, { nib: 0.22, passes: 1 });
  }
  map.city(253, 160, 'Naha', { dx: -6.5, dy: 1.5, size: 2.0 });
  map.label('Ishigaki', 233, 182.2, { face: 'sans', size: 1.85 });
  map.label('Amami', 274, 149.5, { face: 'sans', size: 1.85 });
  map.waves(232, 154, 0.58, 2);
  // Happy Okinawan islander waving inside inset!
  map.person(275, 179, 0.44, {
    seed: 'okinawa-dancer', pose: 'cheer', hair: 'wavy',
    shirt: { color: C.ochre }, look: -0.5, front: { l: true, r: true },
  });
  map.label('Okinawa', 260, 166.5, { face: 'serif-bold', size: 2.1 });

  const outPath = path.join(__dirname, '..', 'out', 'japan_cultural_map.png');
  const out = await map.save(outPath);
  console.log('Saved:', out);
}

main().catch((e) => { console.error(e); process.exit(1); });
