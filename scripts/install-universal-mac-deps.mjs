#!/usr/bin/env node
/**
 * Stages every macOS native dependency into node_modules in a shape that lets
 * electron-builder produce a working universal Keel.app.
 *
 * Background: when this repo is `npm install`ed on an Apple Silicon machine,
 * npm only installs the arm64 variant of each platform-split native package.
 * electron-builder's universal pack does not re-resolve optionalDependencies
 * per arch, so without this script the universal .app ships with arm64-only
 * binaries and silently crashes the first time it touches them on Intel.
 *
 * What this does:
 *   1. Ensures node_modules/@napi-rs/canvas-darwin-x64 exists (transitive via
 *      pdf-parse). The canvas package picks the right -darwin-{arm64,x64}
 *      sibling at runtime.
 *   2. Ensures node_modules/ffmpeg-static/ffmpeg is a Mach-O universal binary
 *      (lipo of the upstream darwin-x64 + darwin-arm64 release assets).
 *
 * Not handled:
 *   - @lancedb/lancedb-darwin-x64 has not been published since 0.22.x. Our
 *     vectorStore.ts catches the import failure on Intel and the retrieval
 *     pipeline falls back to FTS5 keyword search.
 *   - better-sqlite3 builds from source via @electron/rebuild during
 *     electron-builder's per-arch pack, which produces a universal-mergeable
 *     .node without our help.
 *
 * Idempotent: safe to re-run; skips work that's already done.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');

if (process.platform !== 'darwin') {
  console.log('install-universal-mac-deps: not on macOS, skipping.');
  process.exit(0);
}

async function main() {
  await ensureCanvasX64();
  await ensureUniversalFfmpeg();
  console.log('install-universal-mac-deps: done.');
}

// ---------------------------------------------------------------------------
// @napi-rs/canvas-darwin-x64
// ---------------------------------------------------------------------------

async function ensureCanvasX64() {
  const targetDir = path.join(NODE_MODULES, '@napi-rs', 'canvas-darwin-x64');
  const armDir = path.join(NODE_MODULES, '@napi-rs', 'canvas-darwin-arm64');

  if (!fs.existsSync(armDir)) {
    throw new Error(
      `Expected ${armDir} to exist. Run \`npm install\` first.`
    );
  }

  const armPkg = JSON.parse(
    fs.readFileSync(path.join(armDir, 'package.json'), 'utf8')
  );
  const version = armPkg.version;

  if (fs.existsSync(targetDir)) {
    const existing = JSON.parse(
      fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8')
    );
    if (existing.version === version) {
      console.log(
        `install-universal-mac-deps: @napi-rs/canvas-darwin-x64@${version} already present.`
      );
      return;
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  const tarballUrl = `https://registry.npmjs.org/@napi-rs/canvas-darwin-x64/-/canvas-darwin-x64-${version}.tgz`;
  console.log(
    `install-universal-mac-deps: fetching @napi-rs/canvas-darwin-x64@${version}`
  );
  await extractNpmTarball(tarballUrl, targetDir);

  const node = path.join(targetDir, `skia.darwin-x64.node`);
  if (!fs.existsSync(node)) {
    throw new Error(
      `Expected ${node} after extraction; tarball layout changed?`
    );
  }
  assertArch(node, 'x86_64');
}

// ---------------------------------------------------------------------------
// ffmpeg-static: lipo a universal binary in place
// ---------------------------------------------------------------------------

async function ensureUniversalFfmpeg() {
  const ffmpegDir = path.join(NODE_MODULES, 'ffmpeg-static');
  const ffmpegPath = path.join(ffmpegDir, 'ffmpeg');
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ffmpegDir, 'package.json'), 'utf8')
  );
  const releaseTag = pkg['ffmpeg-static']?.['binary-release-tag'];
  if (!releaseTag) {
    throw new Error('ffmpeg-static package.json missing binary-release-tag');
  }

  if (fs.existsSync(ffmpegPath) && lipoArchs(ffmpegPath).sort().join(',') === 'arm64,x86_64') {
    console.log(
      'install-universal-mac-deps: ffmpeg-static/ffmpeg already universal.'
    );
    return;
  }

  console.log(
    `install-universal-mac-deps: building universal ffmpeg from release ${releaseTag}`
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-ffmpeg-'));
  try {
    const armBin = path.join(tmp, 'ffmpeg-arm64');
    const x64Bin = path.join(tmp, 'ffmpeg-x64');

    await downloadAndGunzip(
      `https://github.com/eugeneware/ffmpeg-static/releases/download/${releaseTag}/ffmpeg-darwin-arm64.gz`,
      armBin
    );
    await downloadAndGunzip(
      `https://github.com/eugeneware/ffmpeg-static/releases/download/${releaseTag}/ffmpeg-darwin-x64.gz`,
      x64Bin
    );

    assertArch(armBin, 'arm64');
    assertArch(x64Bin, 'x86_64');

    fs.mkdirSync(ffmpegDir, { recursive: true });
    execFileSync(
      'lipo',
      ['-create', armBin, x64Bin, '-output', ffmpegPath],
      { stdio: 'inherit' }
    );
    fs.chmodSync(ffmpegPath, 0o755);

    const archs = lipoArchs(ffmpegPath).sort().join(',');
    if (archs !== 'arm64,x86_64') {
      throw new Error(`ffmpeg-static/ffmpeg lipo produced ${archs}, expected arm64,x86_64`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function lipoArchs(file) {
  const r = spawnSync('lipo', ['-archs', file], { encoding: 'utf8' });
  if (r.status !== 0) return [];
  return r.stdout.trim().split(/\s+/).filter(Boolean);
}

function assertArch(file, expected) {
  const archs = lipoArchs(file);
  if (!archs.includes(expected)) {
    throw new Error(`${file}: expected arch ${expected}, got [${archs.join(', ')}]`);
  }
}

async function downloadFollowing(url, redirects = 0) {
  if (redirects > 5) throw new Error(`Too many redirects from ${url}`);
  const res = await fetch(url, { redirect: 'manual' });
  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    return downloadFollowing(res.headers.get('location'), redirects + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

async function downloadAndGunzip(url, destPath) {
  const res = await downloadFollowing(url);
  const out = fs.createWriteStream(destPath);
  await pipeline(res.body, createGunzip(), out);
  fs.chmodSync(destPath, 0o755);
}

async function extractNpmTarball(url, destDir) {
  const res = await downloadFollowing(url);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-tarball-'));
  const tarPath = path.join(tmp, 'pkg.tgz');
  try {
    const out = fs.createWriteStream(tarPath);
    await pipeline(res.body, out);
    fs.mkdirSync(destDir, { recursive: true });
    // npm tarballs have a leading "package/" directory; strip it.
    execFileSync(
      'tar',
      ['-xzf', tarPath, '-C', destDir, '--strip-components=1'],
      { stdio: 'inherit' }
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('install-universal-mac-deps:', err);
  process.exit(1);
});
