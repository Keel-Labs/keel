#!/usr/bin/env node
/**
 * Downloads the pre-compiled whisper-cli universal binary from the
 * whisper-binaries GitHub release into resources/whisper.
 *
 * Run manually:  node scripts/download-whisper-binary.js
 * Runs automatically before electron-builder via "predist:mac" npm script.
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = 'Keel-Labs/keel';
const RELEASE_TAG = 'whisper-binaries';
const ASSET_NAME = 'whisper-macos-universal';
const DEST = path.join(__dirname, '..', 'resources', 'whisper');

function download(url, dest, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Too many redirects'));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'keel-build-script' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return resolve(download(res.headers.location, dest, redirectCount + 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} from ${url}`));

      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const file = fs.createWriteStream(dest + '.partial');

      res.on('data', (chunk) => {
        received += chunk.length;
        if (total) {
          const pct = Math.round((received / total) * 100);
          process.stdout.write(`\r  Downloading… ${pct}% (${(received / 1e6).toFixed(1)} MB)`);
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        fs.renameSync(dest + '.partial', dest);
        process.stdout.write('\n');
        resolve();
      });
      file.on('error', (err) => { fs.unlink(dest + '.partial', () => {}); reject(err); });
    });
    req.on('error', reject);
  });
}

async function main() {
  // Skip if already present and non-empty
  if (fs.existsSync(DEST) && fs.statSync(DEST).size > 1_000_000) {
    console.log('✅ whisper binary already present, skipping download.');
    return;
  }

  console.log(`📦 Downloading whisper binary from ${REPO} @ ${RELEASE_TAG}…`);
  fs.mkdirSync(path.dirname(DEST), { recursive: true });

  // Resolve the asset download URL via GitHub API
  const apiUrl = `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`;
  const releaseJson = await new Promise((resolve, reject) => {
    https.get(apiUrl, { headers: { 'User-Agent': 'keel-build-script' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });

  const asset = releaseJson.assets?.find((a) => a.name === ASSET_NAME);
  if (!asset) {
    throw new Error(
      `Asset "${ASSET_NAME}" not found in release "${RELEASE_TAG}".\n` +
      `Run the "Build Whisper Binaries" GitHub Actions workflow first.`
    );
  }

  await download(asset.browser_download_url, DEST);
  fs.chmodSync(DEST, 0o755);
  console.log(`✅ whisper binary saved to resources/whisper (${(fs.statSync(DEST).size / 1e6).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
