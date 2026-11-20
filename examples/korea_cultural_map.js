'use strict';
const path = require('path');
const { createMap, PALETTE: C } = require('../src');

async function main() {
  const map = createMap({
    id: 'korea-cartographic-atlas',
    w: 300,
    h: 200,
    // `--fast` renders a half-resolution preview
    ppm: process.argv.includes('--fast') ? 5 : 10,
    seed: 'atlas-korea-map-v1',
    paper: 'hotpress',
  });

  // Fit the mainland + Jeju into the middle of the spread; the seas on both sides hold the vignettes
  const proj = map.fitProjection([125.9, 33.1, 129.7, 38.65], { frame: [104, 21, 204, 187] });
  const at = (lon, lat, dx = 0, dy = 0) => {
    const [x, y] = proj(lon, lat);
    return [x + dx, y + dy];
  };

  // =========================================================================
  // 1. GRATICULE + COASTLINES (Natural Earth 1:50m, loaded by country)
  // =========================================================================
  map.graticule(proj, { step: 2 });

  // South Korea in warm parchment; every neighbour inside the frame (North Korea, China, Japan)
  // is found and drawn automatically in muted grey
  map.countries(proj, { focus: 'KOR', color: C.land });

  map.regionLabel('NORTH KOREA', 133, 17, { size: 2.5, color: '#6e6658' });
  map.regionLabel('JAPAN', ...at(132.6, 34.75), { size: 2.9, color: '#6e6658' });
  map.regionLabel('CHINA', ...at(122.05, 37.0), { size: 2.2, color: '#6e6658' });

  // =========================================================================
  // 2. RIVERS & MOUNTAINS
  // =========================================================================
  map.river(proj.pts([[128.75, 37.2], [128.2, 37.15], [127.7, 37.4], [127.2, 37.55], [126.85, 37.58], [126.6, 37.75]]), { nib: 0.4 }); // Han
  map.river(proj.pts([[128.95, 37.0], [128.55, 36.55], [128.35, 36.1], [128.45, 35.6], [128.8, 35.35], [128.95, 35.12]]), { nib: 0.4 }); // Nakdong
  map.river(proj.pts([[127.55, 35.95], [127.6, 36.35], [127.2, 36.48], [126.9, 36.25], [126.75, 36.02]]), { nib: 0.34 }); // Geum
  map.river(proj.pts([[127.25, 35.55], [127.45, 35.2], [127.75, 34.98]]), { nib: 0.3 }); // Seomjin

  const peaks = (list) => list.map(([lon, lat, w, h, snow]) => [...proj(lon, lat), w, h, snow]);
  // Taebaek range down the east coast
  map.mountainRange(peaks([
    [128.42, 38.22, 5.0, 6.2, true],
    [128.6, 37.82, 5.6, 7.0, true],
    [128.85, 37.35, 5.2, 6.2, false],
    [129.05, 36.85, 4.8, 5.6, false],
  ]));
  // Sobaek range and Jirisan across the south
  map.mountainRange(peaks([
    [128.25, 36.75, 4.8, 5.4, false],
    [127.8, 36.3, 4.6, 5.0, false],
    [127.72, 35.42, 5.6, 6.4, false],
  ]));
  map.el.pine(...at(127.95, 38.05), 0.46);
  map.el.pine(...at(127.55, 36.95), 0.44);
  map.el.pine(...at(129.1, 36.4), 0.42);
  map.label('Seoraksan', ...at(128.42, 38.22, 14, -2.5), { face: 'sans', size: 1.85 });
  map.label('Jirisan', ...at(127.72, 35.42, 0, 3.4), { face: 'sans', size: 1.85 });

  // Boseong green tea terraces on the south coast
  map.riceFields(...at(127.08, 34.78), 9.5, 4.2);

  // =========================================================================
  // 3. HIGH-SPEED RAIL, FERRY ROUTE & SEA NAMES
  // =========================================================================
  const SEOUL = [126.98, 37.56], DAEJEON = [127.38, 36.35], DAEGU = [128.6, 35.87], BUSAN = [129.04, 35.12];
  const GWANGJU = [126.85, 35.16], MOKPO = [126.39, 34.81], JEJU = [126.53, 33.5];
  // KTX Gyeongbu line (Seoul - Daejeon - Daegu - Busan) and Honam line (Daejeon - Gwangju - Mokpo)
  map.route(proj.pts([SEOUL, [127.1, 36.8], DAEJEON, [127.95, 36.1], DAEGU, [129.0, 35.6], BUSAN]), { color: C.navy, nib: 0.19 });
  map.route(proj.pts([DAEJEON, [127.05, 35.85], GWANGJU, MOKPO]), { color: C.navy, nib: 0.19 });
  // Mokpo - Jeju ferry
  map.route(proj.pts([MOKPO, [126.2, 34.3], [126.35, 33.85], JEJU]), { color: '#9e5847', nib: 0.15 });

  map.seaLabel('YELLOW SEA', 62, 96, { size: 3.5 });
  map.seaLabel('EAST SEA', 247, 62, { size: 3.5 });
  map.seaLabel('(Sea of Japan)', 247, 67.5, { size: 2.0, spacing: 0.08 });
  map.seaLabel('KOREA STRAIT', 181, 169, { size: 2.0, spacing: 0.1 });
  for (const [wx, wy, s] of [[40, 108, 0.72], [78, 150, 0.7], [226, 44, 0.72], [262, 98, 0.72], [158, 181, 0.66]]) {
    map.waves(wx, wy, s, 2);
  }

  // =========================================================================
  // 4. CITIES, LANDMARKS & CULTURAL VIGNETTES
  // =========================================================================

  // --- SEOUL & THE NORTHWEST ---
  const [seX, seY] = proj(...SEOUL);
  map.el.hillTower(seX + 6.5, seY + 3.2, 0.5);
  map.city(seX, seY, 'Seoul', { capital: true, dx: -1.5, dy: -4.2, size: 3.1 });
  map.city(...at(126.63, 37.46), 'Incheon', { dx: -6.5, dy: 2.6, size: 2.0 });

  // Gyeongbokgung palace gate + hanbok, out in the Yellow Sea
  map.el.palaceGate(62, 82, 0.74);
  map.el.hanbok(80, 83, 0.46, { seed: 'seoul-hanbok', look: -0.5 });
  map.label('Gyeongbokgung Palace', 66, 86.5, { face: 'sans-bold', size: 2.0 });
  map.callout([73, 70], [seX - 4, seY + 1], { bendY: -3 });
  map.el.sailboat(27, 130, 0.7);

  // --- GANGWON & THE EAST COAST ---
  map.city(...at(128.9, 37.75), 'Gangneung', { dx: 9.5, dy: 0.8, size: 2.0 });
  map.el.tiger(...at(128.0, 37.6, 0, 2), 0.5);
  map.label('Ulleungdo', ...at(130.87, 37.5, 0, 6.8), { face: 'sans', size: 1.85, color: '#456473' });

  // Yeongdeok snow crab & an East Sea whale
  map.el.crab(232, 92, 0.8);
  map.label('Yeongdeok Snow Crab', 232, 99.5, { face: 'sans-bold', size: 2.0 });
  map.callout([222, 93], at(129.42, 36.42, 2, 0), { bendY: -2 });

  map.el.whale(264, 80, 0.8);
  map.label('Ulsan Whale', 264, 86.5, { face: 'sans', size: 2.0, color: '#426a80' });

  // --- CHUNGCHEONG & GYEONGSANG ---
  map.city(...proj(...DAEJEON), 'Daejeon', { dx: -7.5, dy: -1.0, size: 2.1 });
  map.el.hahoeMask(...at(128.52, 36.56, 0, -1), 0.5);
  map.label('Andong Mask', ...at(128.52, 36.56, 0, 4.2), { face: 'sans', size: 1.85 });
  map.city(...proj(...DAEGU), 'Daegu', { dx: 6.0, dy: -1.6, size: 2.1 });

  const [gjX, gjY] = proj(129.22, 35.84);
  map.el.stoneObservatory(gjX + 0.5, gjY + 1.5, 0.46);
  map.label('Gyeongju', gjX - 3.5, gjY - 6.6, { face: 'sans-bold', size: 2.0 });

  const [buX, buY] = proj(...BUSAN);
  map.city(buX, buY, 'Busan', { dx: 6.2, dy: 2.6, size: 2.3 });
  map.el.lighthouse(buX + 15, buY + 12.5, 0.5);

  // --- JEOLLA (SOUTHWEST) ---
  const [jjX, jjY] = proj(127.15, 35.82);
  map.el.hanok(jjX - 0.5, jjY + 0.5, 0.48);
  map.label('Jeonju', jjX - 0.5, jjY + 3.4, { face: 'sans-bold', size: 2.0 });

  map.el.bibimbap(58, 122, 0.74);
  map.label('Jeonju Bibimbap', 58, 126.4, { face: 'sans-bold', size: 2.0 });
  map.callout([67, 119], [jjX - 6, jjY - 1], { bendY: -3 });

  map.city(...proj(...GWANGJU), 'Gwangju', { dx: -6.5, dy: -1.2, size: 2.1 });
  map.city(...proj(...MOKPO), 'Mokpo', { dx: 8.5, dy: 4.2, size: 2.0 });
  map.label('Boseong Tea', ...at(127.08, 34.78, 0, -3.4), { face: 'sans', size: 1.85 });

  // Kimchi jars & a cook
  map.el.onggi(36, 150, 0.74);
  map.person(52, 152, 0.46, {
    seed: 'kimchi-cook', pose: 'raise', hair: 'bun', shirt: { color: C.paper }, apron: C.crimson, look: -0.5, front: { r: true },
  });
  map.label('Kimchi Jars (Onggi)', 42, 156.2, { face: 'sans', size: 2.0 });

  map.el.gimbap(86, 168, 0.72);
  map.label('Gimbap', 86, 172.2, { face: 'sans', size: 2.0 });

  // --- SOUTH COAST & JEJU ---
  map.el.turtleShip(153, 163, 0.7);
  map.label('Turtle Ship (Yeosu)', 153, 167.6, { face: 'sans-bold', size: 2.0 });
  map.callout([154, 149], at(127.72, 34.72, 0, 1.5), { bendX: 1.5 });

  const [jeX, jeY] = proj(...JEJU);
  map.el.mountain(...at(126.56, 33.36, 0.5, 2.9), 0.2, { color: C.mountain });
  map.city(jeX, jeY, 'Jeju', { dx: -6.2, dy: -1.8, size: 2.1 });
  map.el.dolHareubang(jeX + 17, jeY + 5.5, 0.52);
  map.label('Dol Hareubang', jeX + 17, jeY + 9.2, { face: 'sans', size: 1.9 });
  map.el.tangerine(jeX - 23, jeY + 3.5, 0.66);
  map.label('Jeju Tangerines', jeX - 23, jeY + 7.4, { face: 'sans', size: 1.9 });

  // --- NATIONAL SYMBOLS & A TRAIN IN THE EAST SEA ---
  map.el.mugunghwa(226, 121, 0.72);
  map.label('Mugunghwa', 226, 128.4, { face: 'sans', size: 2.0 });

  map.el.shinkansen(250, 124, 0.56, -0.1, { stripe: C.crimson });
  map.label('KTX', 251, 129.2, { face: 'sans-bold', size: 1.95, color: C.navy });

  map.el.hanbok(276, 108, 0.46, { seed: 'east-hanbok', pose: 'wave', skirt: C.navy, jacket: C.sakura, look: -0.6 });

  // =========================================================================
  // 5. CARTOUCHE & COMPASS
  // =========================================================================
  map.cartouche(13.5, 13.0, 88, 44, {
    country: 'KOREA',
    titleSize: 8.6,
    subtitle: 'Daehan Minguk  ·  Republic of Korea',
    flag: 'KOR',
    capital: 'Seoul',
    language: 'Korean',
    population: '51.7 Million',
    area: '100,410 km2',
    legend: [
      { symbol: 'capital', label: 'Capital' },
      { symbol: 'city', label: 'Major City' },
      { symbol: 'route', label: 'KTX Railway' },
    ],
    mmPerKm: proj.mmPerKm,
  });

  map.compass(262, 33, 8.2, { angle: proj.northAngle(131.5, 38.5), rhumb: true });

  const outPath = path.join(__dirname, '..', 'out', 'korea_cultural_map.png');
  const out = await map.save(outPath);
  console.log('Saved:', out);
}

main().catch((e) => { console.error(e); process.exit(1); });
