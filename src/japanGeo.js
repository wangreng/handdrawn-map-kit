'use strict';

// Geographically accurate simplified (lon, lat) contours for Japan & neighboring coast
// Designed for ~1:6,500,000 hand-drawn atlas rendering — preserves real peninsulas, bays & straits!

const HOKKAIDO = [
  [140.0, 41.45], // Matsumae (SW tip)
  [140.75, 41.75], // Hakodate
  [141.15, 41.80], // Esan
  [140.45, 42.35], // Uchiura Bay inner
  [140.98, 42.32], // Muroran
  [141.60, 42.60], // Tomakomai
  [142.40, 42.30], // Hidaka coast
  [143.20, 41.93], // Cape Erimo!
  [143.65, 42.65], // Tokachi
  [144.38, 42.98], // Kushiro
  [145.15, 43.08], // Akkeshi
  [145.80, 43.38], // Nemuro Peninsula!
  [145.18, 43.62], // Nemuro Bay
  [145.35, 44.32], // Shiretoko Peninsula!
  [144.45, 44.02], // Abashiri
  [143.35, 44.38], // Monbetsu (Okhotsk coast)
  [142.45, 44.95], // Esashi
  [141.93, 45.52], // Cape Soya (Northernmost tip!)
  [141.62, 45.40], // Wakkanai
  [141.55, 44.65], // Teshio
  [141.32, 43.85], // Rumoi
  [141.30, 43.22], // Ishikari Bay
  [140.42, 43.32], // Shakotan Peninsula!
  [140.25, 42.80], // Iwanai
  [139.82, 42.20], // Setana
  [139.95, 41.65], // Esashi SW
];

const HONSHU = [
  // Aomori north capes
  [140.32, 41.25], // Tsugaru Peninsula tip (Tappi)
  [140.68, 40.84], // Mutsu Bay / Aomori
  [141.10, 41.22], // Mutsu inner
  [140.88, 41.45], // Oma (Shimokita NW)
  [141.45, 41.42], // Shiriyazaki (Shimokita NE)
  // Sanriku & Tohoku Pacific coast
  [141.58, 40.52], // Hachinohe
  [142.05, 39.65], // Miyako (Sanriku rias)
  [141.75, 38.90], // Kesennuma
  [141.52, 38.30], // Ojika Peninsula
  [140.98, 38.25], // Sendai Bay
  [140.95, 37.00], // Iwaki
  [140.65, 36.35], // Hitachinaka
  [140.86, 35.72], // Choshi (Cape Inubo)
  // Kanto & Boso / Tokyo Bay / Miura / Izu
  [140.35, 35.15], // Outer Boso
  [139.85, 34.92], // Tateyama (Boso tip)
  [139.92, 35.58], // Chiba (inner Tokyo Bay)
  [139.78, 35.64], // Tokyo Bay head
  [139.66, 35.25], // Miura Peninsula
  [139.15, 35.25], // Sagami Bay / Odawara
  [138.94, 34.62], // Izu Peninsula tip (Shimoda)
  [138.78, 35.08], // Suruga Bay head (Numazu / Fuji)
  [138.22, 34.60], // Omaezaki (Shizuoka)
  // Tokai & Ise Bay & Kii Peninsula
  [137.10, 34.65], // Atsumi Peninsula
  [136.85, 35.08], // Nagoya (Ise Bay)
  [136.88, 34.42], // Shima
  [136.05, 33.82], // Kumano
  [135.76, 33.44], // Cape Shionomisaki (Kii south tip!)
  [135.15, 33.90], // Wakayama coast
  [135.18, 34.32], // Wakayama / Osaka Strait
  [135.48, 34.66], // Osaka Bay head
  [134.95, 34.62], // Akashi / Kobe
  // Seto Inland Sea coast (Sanyo)
  [134.10, 34.58], // Okayama
  [133.35, 34.38], // Fukuyama
  [132.45, 34.35], // Hiroshima Bay
  [132.05, 33.95], // Yanai
  [131.20, 33.96], // Ube
  [130.90, 33.96], // Shimonoseki (Western tip!)
  // Sea of Japan coast (San'in -> Hokuriku -> Tohoku)
  [130.92, 34.38], // Nagato
  [131.70, 34.68], // Masuda
  [132.68, 35.42], // Izumo / Shimane Peninsula
  [133.35, 35.48], // Yonago
  [134.22, 35.54], // Tottori dunes
  [135.15, 35.75], // Tango Peninsula
  [135.65, 35.52], // Wakasa Bay
  [136.05, 35.95], // Echizen
  [136.60, 36.60], // Kanazawa
  [136.75, 37.35], // Noto Peninsula outer
  [137.32, 37.52], // Noto Peninsula tip (Suzu)!
  [137.02, 37.05], // Nanao / inner Noto
  [137.22, 36.76], // Toyama Bay!
  [137.85, 36.95], // Itoigawa
  [138.55, 37.40], // Kashiwazaki
  [139.05, 37.92], // Niigata
  [139.48, 38.45], // Murakami
  [139.82, 38.92], // Sakata
  [140.05, 39.68], // Akita
  [139.70, 39.96], // Oga Peninsula!
  [140.02, 40.25], // Noshiro
  [139.96, 40.62], // Fukaura
];

const SHIKOKU = [
  [134.62, 34.18], // Naruto (NE)
  [134.18, 33.26], // Cape Muroto (SE)!
  [133.55, 33.52], // Tosa Bay (Kochi)
  [132.98, 32.74], // Cape Ashizuri (SW)!
  [132.45, 33.20], // Uwajima
  [132.02, 33.35], // Sada Misaki Peninsula (West)!
  [132.72, 33.90], // Matsuyama
  [133.00, 34.12], // Imabari
  [133.65, 33.98], // Hiuchi Nada
  [134.05, 34.36], // Takamatsu
];

const KYUSHU = [
  [130.96, 33.92], // Kitakyushu / Moji
  [131.72, 33.62], // Kunisaki Peninsula!
  [131.62, 33.25], // Beppu / Oita
  [131.92, 32.95], // Saiki
  [131.45, 31.92], // Miyazaki coast
  [131.12, 31.38], // Nichinan / Shibushi
  [130.66, 31.00], // Cape Sata (Southern tip!)
  [130.68, 31.62], // Kagoshima Bay inner
  [130.52, 31.22], // Ibusuki (Satsuma tip)
  [130.15, 31.40], // Makurazaki
  [130.22, 32.05], // Sendai
  [130.52, 32.65], // Yatsushiro
  [130.20, 32.58], // Shimabara / Amakusa
  [129.78, 32.68], // Nagasaki Peninsula!
  [129.62, 33.28], // Sasebo / Hirado
  [130.35, 33.62], // Fukuoka / Hakata
];

const SMALL_ISLANDS = [
  // Sado Island
  [[138.22, 37.82], [138.52, 38.32], [138.58, 38.05], [138.28, 37.78]],
  // Awaji Island
  [[134.75, 34.25], [135.02, 34.60], [134.95, 34.35]],
  // Tsushima
  [[129.18, 34.10], [129.42, 34.68], [129.48, 34.40], [129.28, 34.08]],
  // Goto Islands
  [[128.65, 32.62], [129.08, 32.98], [128.95, 32.68]],
  // Tanegashima
  [[130.92, 30.35], [131.08, 30.82], [131.02, 30.42]],
  // Yakushima
  [[130.40, 30.28], [130.64, 30.42], [130.62, 30.24], [130.42, 30.22]],
  // Izu Oshima
  [[139.35, 34.70], [139.44, 34.78], [139.42, 34.68]],
  // Rishiri
  [[141.15, 45.15], [141.30, 45.24], [141.28, 45.12]],
  // Kunashiri (NE off Nemuro)
  [[145.45, 43.75], [146.50, 44.45], [146.55, 44.18], [145.65, 43.68]],
];

// Neighboring Korean Peninsula & Primorye coast (for upper-left context)
const KOREA_MAINLAND = [
  [124.0, 46.0],
  [135.5, 45.5],
  [134.0, 43.5],
  [131.9, 43.1], // Vladivostok
  [130.6, 42.3],
  [129.8, 41.8],
  [129.4, 40.6],
  [128.0, 39.2], // East Korea Bay
  [128.6, 38.1],
  [129.45, 36.05], // Pohang
  [129.08, 35.12], // Busan
  [128.20, 34.78], // South coast
  [126.40, 34.40], // Mokpo (SW)
  [126.55, 35.80], // Yellow Sea coast
  [126.10, 36.75], // Taean
  [126.65, 37.45], // Incheon
  [124.0, 39.5],
];

// Lake Biwa (Shiga)
const LAKE_BIWA = [
  [135.88, 35.02],
  [136.02, 35.48],
  [136.22, 35.42],
  [136.08, 35.12],
];

module.exports = {
  HOKKAIDO,
  HONSHU,
  SHIKOKU,
  KYUSHU,
  SMALL_ISLANDS,
  KOREA_MAINLAND,
  LAKE_BIWA,
};
