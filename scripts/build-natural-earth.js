'use strict';
// Rebuilds data/ne_50m_admin_0_countries.json from the public-domain Natural Earth
// "Admin 0 – Countries" layer (https://www.naturalearthdata.com/).
//
//   node scripts/build-natural-earth.js                 # download the pinned 1:50m release
//   node scripts/build-natural-earth.js path/to.geojson # or convert a local GeoJSON file
//
// Only the geometry and a few naming fields are kept; coordinates are rounded to 3 decimals (~100 m).
const fs = require('fs');
const path = require('path');
const { fromGeoJSON } = require('../src/geo');

const VERSION = 'v5.1.2';
const SCALE = '50m';
const URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${VERSION}/geojson/ne_${SCALE}_admin_0_countries.geojson`;
const OUT = path.join(__dirname, '..', 'data', `ne_${SCALE}_admin_0_countries.json`);

async function main() {
  const local = process.argv[2];
  let geojson;
  if (local) {
    geojson = JSON.parse(fs.readFileSync(local, 'utf8'));
  } else {
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${URL}`);
    geojson = await res.json();
  }

  const round = (v) => Math.round(v * 1000) / 1000;
  const countries = fromGeoJSON(geojson).countries
    .map((c) => ({
      ...c,
      // Flat [lon, lat, lon, lat, ...] rings without the repeated closing point
      polygons: c.polygons.map((poly) => poly.map((ring) => ring.flatMap(([lon, lat]) => [round(lon), round(lat)]))),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const head = {
    source: `Natural Earth 1:${SCALE} Admin 0 - Countries ${VERSION} (naturalearthdata.com)`,
    license: 'Public domain',
    url: URL,
    flat: true,
  };
  // One country per line keeps the file diffable
  const body = countries.map((c) => '    ' + JSON.stringify(c)).join(',\n');
  const json = `${JSON.stringify(head, null, 2).slice(0, -2)},\n  "countries": [\n${body}\n  ]\n}\n`;
  fs.writeFileSync(OUT, json);
  console.log(`Wrote ${OUT}: ${countries.length} countries, ${(json.length / 1e6).toFixed(2)} MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
