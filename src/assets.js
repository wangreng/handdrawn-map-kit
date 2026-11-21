'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const SVG = require('./svgDraw');

const REPO_ASSETS_DIR = path.join(__dirname, '..', 'assets', 'elements');
const VALID_ASSET_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * Resolve the current user's private local SVG asset directory.
 * Always local to the machine (outside the git repository) so user-generated
 * assets never flow back into the repository or to other users.
 */
function getUserAssetsDir(explicitDir) {
  if (explicitDir && typeof explicitDir === 'string') {
    return path.resolve(explicitDir);
  }
  if (process.env.HANDDRAWN_MAP_ASSETS_DIR) {
    return path.resolve(process.env.HANDDRAWN_MAP_ASSETS_DIR);
  }
  return path.join(os.homedir(), '.handdrawn-map', 'elements');
}

function getRepoAssetsDir() {
  return REPO_ASSETS_DIR;
}

function isValidAssetName(name) {
  return typeof name === 'string' && VALID_ASSET_NAME_RE.test(name);
}

/**
 * Derive a clean asset name from an inline SVG element's `assetName` or `id`.
 * Strips common prefixes like `el-` or `svg-`.
 */
function deriveAssetName(el, fallbackIndex = 0) {
  const raw = (el && (el.assetName || el.name || el.id)) || `svg-${fallbackIndex + 1}`;
  let cleaned = String(raw)
    .trim()
    .replace(/^(?:el|svg)[-_]+/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!cleaned || !/^[a-zA-Z0-9]/.test(cleaned)) {
    cleaned = `asset-${fallbackIndex + 1}`;
  }
  return cleaned;
}

function readSvgDir(dir, source) {
  const entries = [];
  if (!dir || !fs.existsSync(dir)) return entries;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return entries;
  }
  for (const file of names) {
    if (!file.toLowerCase().endsWith('.svg')) continue;
    const name = file.slice(0, -4);
    if (!isValidAssetName(name)) continue;
    const fullPath = path.join(dir, file);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    entries.push({ name, source, path: fullPath });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

/**
 * List available SVG assets across the user's private local directory and the
 * repository's built-in `assets/elements/` directory.
 * Precedence: explicit assetDir > user private dir > repo built-in dir.
 */
function listSvgAssets(opts = {}) {
  const seen = new Map();
  const dirs = [];

  if (opts.assetDir) {
    dirs.push({ dir: path.resolve(opts.assetDir), source: 'custom' });
  }
  const userDir = getUserAssetsDir();
  if (!opts.assetDir || path.resolve(opts.assetDir) !== userDir) {
    dirs.push({ dir: userDir, source: 'user' });
  }
  if (opts.includeRepo !== false) {
    dirs.push({ dir: REPO_ASSETS_DIR, source: 'repo' });
  }

  for (const { dir, source } of dirs) {
    for (const entry of readSvgDir(dir, source)) {
      if (!seen.has(entry.name)) {
        seen.set(entry.name, entry);
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a named SVG asset to `{ name, source, path, svg }` or `null`.
 */
function resolveSvgAsset(name, opts = {}) {
  if (!isValidAssetName(name)) return null;

  const dirs = [];
  if (opts.assetDir) {
    dirs.push({ dir: path.resolve(opts.assetDir), source: 'custom' });
  }
  const userDir = getUserAssetsDir();
  if (!opts.assetDir || path.resolve(opts.assetDir) !== userDir) {
    dirs.push({ dir: userDir, source: 'user' });
  }
  if (opts.includeRepo !== false) {
    dirs.push({ dir: REPO_ASSETS_DIR, source: 'repo' });
  }

  for (const { dir, source } of dirs) {
    const filePath = path.join(dir, `${name}.svg`);
    if (fs.existsSync(filePath)) {
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;
        const svg = fs.readFileSync(filePath, 'utf8');
        return { name, source, path: filePath, svg };
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Save a single SVG string into the target directory (defaults to the user's
 * private local directory `~/.handdrawn-map/elements/`, NEVER the repo unless
 * `toRepo: true` is explicitly passed).
 */
function saveSvgAsset(name, svgString, opts = {}) {
  if (!isValidAssetName(name)) {
    throw new Error(`Invalid SVG asset name "${name}". Use letters, digits, "-" or "_".`);
  }
  if (typeof svgString !== 'string' || !svgString.trim()) {
    throw new Error(`SVG content for "${name}" must be a non-empty string.`);
  }
  const parsed = SVG.parseSvg(svgString);
  if (!parsed || !Array.isArray(parsed.shapes) || parsed.shapes.length === 0) {
    throw new Error(`SVG content for "${name}" does not contain any renderable shapes.`);
  }

  const targetDir = opts.toRepo
    ? REPO_ASSETS_DIR
    : getUserAssetsDir(opts.assetDir);
  fs.mkdirSync(targetDir, { recursive: true });

  const filePath = path.join(targetDir, `${name}.svg`);
  const existed = fs.existsSync(filePath);
  if (existed && !opts.overwrite) {
    return { name, path: filePath, saved: false, skipped: true, reason: 'exists' };
  }

  const content = svgString.trim().endsWith('\n') ? svgString.trim() : `${svgString.trim()}\n`;
  fs.writeFileSync(filePath, content, 'utf8');
  return { name, path: filePath, saved: true, skipped: false, overwritten: existed };
}

/**
 * Extract and save all inline `type: "svg"` string elements from a loaded spec.
 */
function saveAssetsFromSpec(specObj, opts = {}) {
  const results = [];
  const elements = (specObj && Array.isArray(specObj.elements)) ? specObj.elements : [];
  elements.forEach((el, idx) => {
    if (!el || el.type !== 'svg' || typeof el.svg !== 'string') return;
    const name = deriveAssetName(el, idx);
    const res = saveSvgAsset(name, el.svg, opts);
    results.push(res);
  });
  return results;
}

module.exports = {
  REPO_ASSETS_DIR,
  getUserAssetsDir,
  getRepoAssetsDir,
  isValidAssetName,
  deriveAssetName,
  listSvgAssets,
  resolveSvgAsset,
  saveSvgAsset,
  saveAssetsFromSpec,
};
