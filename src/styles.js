'use strict';

// Built-in visual style presets for handdrawn-map-kit.
// Each preset coordinates paper stock, color palette, stroke medium, fill medium,
// ocean rendering, coastal waterlines, border framing, cartouche, compass, and mountains.

const BASE_PALETTE = {
  ink: '#26201c',
  ocean: '#cde0e6',
  oceanShallow: '#bad3dc',
  oceanDeep: '#8db0bf',
  graticule: '#89a7b5',
  neighborLand: '#ded8c6',
  land: '#f3e8cc',
  landWarm: '#efe0bc',
  landGreen: '#dfead0',
  mountain: '#b89f82',
  mountainLight: '#d8c7ad',
  snow: '#fcfaf2',
  river: '#5d93b3',
  lake: '#8abbd4',
  forest: '#8cb076',
  forestDark: '#5e834e',
  sakura: '#f2b8c6',
  vermilion: '#d65340',
  crimson: '#b8372e',
  ochre: '#e0ad48',
  terracotta: '#c97855',
  navy: '#354f66',
  cream: '#faf4e6',
  paper: '#fbf7ee',
  wood: '#b8895a',
  gold: '#e8c160',
  slate: '#8c9ea8',
  matcha: '#7fa858',
  orange: '#e07a2f',
  brown: '#8c5a3c',
  waterline: '#6994a8',
  waterlineOuter: '#88aebf',
  borderAccent: '#e0ad48',
  callout: '#6a5d52',
  divider: '#9c8e7b',
  shadow: '#5c5349',
  tickLabel: '#456473',
  neighborOutline: '#5c5549',
  admin1Border: '#7d7365',
  lakeOutline: '#4a7a96',
};

const STYLES = {
  'vintage-atlas': {
    name: 'vintage-atlas',
    label: 'Vintage Atlas (经典复古绘本)',
    description: 'Mizielinski-inspired hotpress paper, technical fineliner, colored pencil fill, zebra neatline border.',
    paper: 'hotpress',
    isDark: false,
    palette: { ...BASE_PALETTE },
    stroke: {
      tool: 'fineliner',
      kind: 'technical',
      nibMul: 1.0,
      tremor: 0.55,
      smooth: 0.25,
      profile: 'even',
    },
    fill: {
      mode: 'pencil',
    },
    ocean: {
      mode: 'wash',
      strength: 0.82,
      toothAmt: 0.38,
    },
    waterlines: {
      mode: 'concentric',
      r1: 1.4,
      r2: 2.8,
    },
    border: 'zebra',
    cartouche: 'parchment',
    compass: 'classic',
    mountains: 'classic',
  },

  blueprint: {
    name: 'blueprint',
    label: 'Cyanotype Blueprint (工程蓝图)',
    description: 'Deep cyanotype navy paper, luminous white & cyan opaque gel ink, technical cross-hatch land, crosshair frame.',
    paper: 'navy',
    isDark: true,
    palette: {
      ...BASE_PALETTE,
      ink: '#eef7ff',
      ocean: '#15274a',
      oceanShallow: '#284c82',
      oceanDeep: '#0f1d38',
      graticule: '#4973ad',
      neighborLand: '#1d345e',
      land: '#254278',
      landWarm: '#2c4d8a',
      landGreen: '#204a66',
      mountain: '#4c7cb8',
      mountainLight: '#335a8f',
      snow: '#f2f9ff',
      river: '#7fd0ff',
      lake: '#1a3b6b',
      forest: '#2e6b7a',
      forestDark: '#1f4f5e',
      crimson: '#ffd166',
      vermilion: '#ff9e5e',
      ochre: '#7cd4ff',
      terracotta: '#7eb2de',
      navy: '#9ed8ff',
      cream: '#132445',
      paper: '#182c52',
      wood: '#7ea3cc',
      gold: '#ffd166',
      slate: '#5e8cc4',
      waterline: '#99dcff',
      waterlineOuter: '#5b92c9',
      borderAccent: '#7cd4ff',
      callout: '#a6cef5',
      divider: '#5886bd',
      shadow: '#0a1426',
      tickLabel: '#a4caf0',
      neighborOutline: '#79a8db',
      admin1Border: '#6997cc',
      lakeOutline: '#8fd4ff',
      seaLabel: '#8fc5f5',
      regionLabel: '#b8d7f5',
    },
    stroke: {
      tool: 'gel',
      nibMul: 1.0,
      tremor: 0.35,
      smooth: 0.22,
      profile: 'even',
    },
    fill: {
      mode: 'blueprint',
      washStrength: 0.62,
      toothAmt: 0.26,
      hatchAngle: 42,
      hatchPitch: 1.6,
      hatchColor: '#3e6ba6',
    },
    ocean: {
      mode: 'blueprint',
      strength: 0.56,
      toothAmt: 0.25,
      gridStep: 10,
      stars: false,
    },
    waterlines: {
      mode: 'glow',
      r1: 1.5,
      r2: 3.1,
    },
    border: 'blueprint',
    cartouche: 'blueprint',
    compass: 'blueprint',
    mountains: 'blueprint',
  },

  nocturne: {
    name: 'nocturne',
    label: 'Celestial Nocturne (暗夜星空)',
    description: 'Midnight obsidian paper, starlit ocean sky, antique gold & ivory gel ink, celestial compass & framing.',
    paper: 'black',
    isDark: true,
    palette: {
      ...BASE_PALETTE,
      ink: '#f3e1b8',
      ocean: '#0e1528',
      oceanShallow: '#1f2f57',
      oceanDeep: '#090e1c',
      graticule: '#3b4d75',
      neighborLand: '#171f36',
      land: '#202b4a',
      landWarm: '#273457',
      landGreen: '#1c3347',
      mountain: '#4d608c',
      mountainLight: '#33446e',
      snow: '#faf2de',
      river: '#7cb7eb',
      lake: '#15274a',
      forest: '#284a59',
      forestDark: '#1c3645',
      crimson: '#f0b354',
      vermilion: '#e88d5a',
      ochre: '#d9a94e',
      terracotta: '#b8855c',
      navy: '#c9b17b',
      cream: '#121a2e',
      paper: '#161f36',
      wood: '#9c8360',
      gold: '#f0c467',
      slate: '#6f82ad',
      waterline: '#d9b86c',
      waterlineOuter: '#5b6f9c',
      borderAccent: '#d9a94e',
      callout: '#bfae8c',
      divider: '#736548',
      shadow: '#060912',
      tickLabel: '#bfb08e',
      neighborOutline: '#7e8eb3',
      admin1Border: '#697aa3',
      lakeOutline: '#8cc2f0',
      seaLabel: '#a8b8d8',
      regionLabel: '#d9c598',
    },
    stroke: {
      tool: 'gel',
      nibMul: 1.0,
      tremor: 0.42,
      smooth: 0.25,
      profile: 'even',
    },
    fill: {
      mode: 'nocturne',
      washStrength: 0.68,
      toothAmt: 0.28,
      hatchAngle: 36,
      hatchPitch: 1.9,
      hatchColor: '#36466b',
    },
    ocean: {
      mode: 'nocturne',
      strength: 0.74,
      toothAmt: 0.26,
      stars: true,
    },
    waterlines: {
      mode: 'glow',
      r1: 1.6,
      r2: 3.3,
    },
    border: 'celestial',
    cartouche: 'nocturne',
    compass: 'celestial',
    mountains: 'nocturne',
  },

  'ink-wash': {
    name: 'ink-wash',
    label: 'Shan-Shui Ink Wash (青绿山水 / 水墨舆图)',
    description: 'Aged xuan-paper cream stock, dynamic sumi brush strokes with flying-white, mineral celadon & ochre ink-wash blooming, scroll frame & vermilion seal.',
    paper: 'cream',
    isDark: false,
    palette: {
      ...BASE_PALETTE,
      ink: '#24221f',
      ocean: '#dce3d8',
      oceanShallow: '#b4ccc0',
      oceanDeep: '#9bb8af',
      graticule: '#a6a08d',
      neighborLand: '#e6dfd0',
      land: '#efe6cf',
      landWarm: '#e7d8b5',
      landGreen: '#c3d8be',
      mountain: '#568570',
      mountainLight: '#84ad92',
      snow: '#f6f2e6',
      river: '#467d8f',
      lake: '#80aab0',
      forest: '#689670',
      forestDark: '#446b52',
      crimson: '#b5332a',
      vermilion: '#c94132',
      ochre: '#c48f47',
      terracotta: '#b87654',
      navy: '#375866',
      cream: '#f5eedc',
      paper: '#f3ebd7',
      wood: '#9e754d',
      gold: '#cfa052',
      slate: '#7a8c87',
      waterline: '#6b9694',
      waterlineOuter: '#93b3ad',
      borderAccent: '#b5332a',
      callout: '#6e6559',
      divider: '#8f8574',
      shadow: '#8a8273',
      tickLabel: '#6b6458',
      neighborOutline: '#6b655b',
      admin1Border: '#8c8374',
      lakeOutline: '#4f808a',
      seaLabel: '#4f7a7d',
      regionLabel: '#6e6456',
    },
    stroke: {
      tool: 'brush',
      nibMul: 1.15,
      tremor: 0.72,
      smooth: 0.36,
      profile: 'swell',
      dryness: 0.34,
    },
    fill: {
      mode: 'ink-wash',
      strength: 0.76,
      toothAmt: 0.38,
      edgeAmt: 0.34,
      cloudAmt: 0.24,
    },
    ocean: {
      mode: 'ink-wash',
      strength: 0.72,
      toothAmt: 0.40,
      cloudAmt: 0.24,
      vignette: 0.16,
    },
    waterlines: {
      mode: 'ink-ripple',
      r1: 1.8,
      r2: 3.5,
    },
    border: 'scroll',
    cartouche: 'scroll',
    compass: 'ink-wash',
    mountains: 'ink-wash',
  },
};

const STYLE_ALIASES = {
  classic: 'vintage-atlas',
  vintage: 'vintage-atlas',
  default: 'vintage-atlas',
  cyanotype: 'blueprint',
  night: 'nocturne',
  starlight: 'nocturne',
  shanshui: 'ink-wash',
  'shan-shui': 'ink-wash',
  sumi: 'ink-wash',
  watercolor: 'ink-wash',
};

const STYLE_NAMES = Object.keys(STYLES);

function resolveStyleName(name) {
  if (!name) return 'vintage-atlas';
  const key = String(name).trim().toLowerCase();
  if (Object.hasOwn(STYLES, key)) return key;
  if (Object.hasOwn(STYLE_ALIASES, key)) return STYLE_ALIASES[key];
  return null;
}

function getStyle(name) {
  const canonical = resolveStyleName(name);
  if (!canonical) {
    throw new Error(`Unknown style preset "${name}" (available: ${STYLE_NAMES.join(', ')}).`);
  }
  const s = STYLES[canonical];
  return {
    ...s,
    palette: { ...s.palette },
    stroke: { ...s.stroke },
    fill: { ...s.fill },
    ocean: { ...s.ocean },
    waterlines: { ...s.waterlines },
  };
}

function resolveStyle(styleSpec) {
  if (typeof styleSpec === 'string') return getStyle(styleSpec);
  const spec = (styleSpec && typeof styleSpec === 'object') ? styleSpec : {};
  const base = getStyle(spec.preset || spec.name || 'vintage-atlas');
  if (spec.palette && typeof spec.palette === 'object') {
    Object.assign(base.palette, spec.palette);
  }
  if (spec.stroke && typeof spec.stroke === 'object') {
    Object.assign(base.stroke, spec.stroke);
  } else if (typeof spec.stroke === 'string') {
    base.stroke.tool = spec.stroke;
  }
  if (spec.fill && typeof spec.fill === 'object') {
    Object.assign(base.fill, spec.fill);
  } else if (typeof spec.fill === 'string') {
    base.fill.mode = spec.fill;
  }
  if (typeof spec.border === 'string') base.border = spec.border;
  if (typeof spec.cartouche === 'string') base.cartouche = spec.cartouche;
  if (typeof spec.compass === 'string') base.compass = spec.compass;
  if (typeof spec.mountains === 'string') base.mountains = spec.mountains;
  if (typeof spec.waterlines === 'string') base.waterlines.mode = spec.waterlines;
  return base;
}

module.exports = {
  BASE_PALETTE,
  STYLES,
  STYLE_NAMES,
  STYLE_ALIASES,
  resolveStyleName,
  getStyle,
  resolveStyle,
};
