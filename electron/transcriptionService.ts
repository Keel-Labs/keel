import { app, net } from 'electron'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { getModelPath } from './modelManager'

const execFileAsync = promisify(execFile)

const REPO = 'Keel-Labs/keel'
const RELEASE_TAG = 'whisper-binaries'

function getWhisperBinaryFileName(): string {
  return process.platform === 'win32' ? 'whisper.exe' : 'whisper'
}

function getWhisperReleaseAssetName(): string {
  if (process.platform === 'win32') return 'whisper-windows-x64.exe'
  return 'whisper-macos-universal'
}

// Where the runtime-downloaded binary lives (writable, outside app bundle)
function getUserDataBinaryPath(): string {
  return path.join(app.getPath('userData'), 'bin', getWhisperBinaryFileName())
}

// ---------------------------------------------------------------------------
// Binary resolution
// ---------------------------------------------------------------------------

/**
 * Returns the path to the whisper-cli binary.
 * Priority:
 *   1. Bundled binary in app extraResources (production app)
 *   2. Runtime-downloaded binary in userData/bin/ (auto-downloaded on first run)
 *   3. Homebrew / system binary (development convenience)
 */
export function getWhisperBinary(): string | null {
  // 1. Bundled inside the packaged app.
  const bundledPath = app.isPackaged
    ? path.join(process.resourcesPath, getWhisperBinaryFileName())
    : path.join(__dirname, '../../../resources', getWhisperBinaryFileName())
  if (fs.existsSync(bundledPath)) return bundledPath

  // 2. Runtime downloaded to userData
  const userDataPath = getUserDataBinaryPath()
  if (fs.existsSync(userDataPath)) return userDataPath

  // 3. Homebrew / system (dev convenience)
  const candidates = [
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
    '/opt/homebrew/bin/whisper-cpp',
    '/usr/local/bin/whisper-cpp',
    '/opt/homebrew/bin/whisper',
    '/usr/local/bin/whisper',
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }

  return null
}

export function isWhisperAvailable(): boolean {
  return getWhisperBinary() !== null
}

// ---------------------------------------------------------------------------
// Runtime binary download (for users without the packaged .app)
// ---------------------------------------------------------------------------

// Use Electron's `net` module instead of Node `https`: it routes through
// Chromium's network stack and the OS trust store, so users behind corporate
// MITM proxies / VPNs (Zscaler etc.) don't trip "unable to get local issuer
// certificate". `net.request` follows redirects by default.
function describeNetError(err: Error): Error {
  const msg = err.message || ''
  if (/ERR_CERT|certificate|issuer/i.test(msg)) {
    return new Error(
      `Network is intercepting HTTPS (${msg}). If you're on a corporate VPN or behind an antivirus that inspects traffic, try a different network or set NODE_EXTRA_CA_CERTS to your org's root certificate.`
    )
  }
  return err
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url })
    req.setHeader('User-Agent', 'keel-app')
    req.on('response', (res) => {
      let data = ''
      res.on('data', (c) => (data += c.toString()))
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e as Error) } })
      res.on('error', (e: Error) => reject(describeNetError(e)))
    })
    req.on('error', (e) => reject(describeNetError(e)))
    req.end()
  })
}

function downloadFile(url: string, dest: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url, redirect: 'follow' })
    req.setHeader('User-Agent', 'keel-app')
    req.on('response', (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
      const total = parseInt((res.headers['content-length'] as string) || '0', 10)
      let received = 0
      const file = fs.createWriteStream(dest + '.partial')
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (total && onProgress) onProgress(Math.round((received / total) * 100))
        file.write(chunk)
      })
      res.on('end', () => {
        file.end()
        file.on('close', () => {
          try { fs.renameSync(dest + '.partial', dest); resolve() } catch (e) { reject(e as Error) }
        })
      })
      res.on('error', (e: Error) => {
        file.destroy()
        fs.unlink(dest + '.partial', () => {})
        reject(describeNetError(e))
      })
    })
    req.on('error', (e) => {
      fs.unlink(dest + '.partial', () => {})
      reject(describeNetError(e))
    })
    req.end()
  })
}

/**
 * Downloads the pre-compiled whisper binary from the GitHub release.
 * Saves to userData/bin/whisper and marks it executable.
 */
export async function downloadWhisperBinary(onProgress?: (pct: number) => void): Promise<void> {
  const dest = getUserDataBinaryPath()
  fs.mkdirSync(path.dirname(dest), { recursive: true })

  const release = await fetchJson(
    `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`
  )
  const asset = release.assets?.find((a: any) => a.name === getWhisperReleaseAssetName())
  if (!asset) throw new Error('Whisper binary not found in release. The build workflow may need to be run first.')

  await downloadFile(asset.browser_download_url, dest, onProgress)
  if (process.platform !== 'win32') fs.chmodSync(dest, 0o755)
}

// ---------------------------------------------------------------------------
// ffmpeg path
// ---------------------------------------------------------------------------

function getFfmpegPath(): string {
  // ffmpeg-static ships a pre-compiled binary at this path
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ffmpegStatic = require('ffmpeg-static') as string
  // In packaged app, ffmpeg-static binary is inside asar but we can use
  // process.resourcesPath to find the unpacked version via asarUnpack config.
  // For now, development path works fine.
  return ffmpegStatic
}

// ---------------------------------------------------------------------------
// Audio conversion
// ---------------------------------------------------------------------------

/**
 * Convert any audio file to 16kHz mono 16-bit PCM WAV — the format
 * required by whisper.cpp.
 */
export async function convertToWhisperWav(inputPath: string): Promise<string> {
  const outputPath = path.join(os.tmpdir(), `keel-whisper-${Date.now()}.wav`)
  const ffmpeg = getFfmpegPath()
  await execFileAsync(ffmpeg, [
    '-y',
    '-i', inputPath,
    '-ar', '16000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    outputPath,
  ])
  return outputPath
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

export interface WhisperSegment {
  start: number   // seconds
  end: number
  text: string
}

export interface TranscriptionResult {
  text: string
  segments: WhisperSegment[]
}

/**
 * Run whisper.cpp against a WAV file and return the full transcript text.
 * Calls onProgress(0–100) as transcription proceeds.
 */
export async function runWhisper(
  wavPath: string,
  model = 'base.en',
  onProgress?: (percent: number) => void,
): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    const binary = getWhisperBinary()
    if (!binary) {
      reject(new Error('whisper-cli binary not found'))
      return
    }
    const modelPath = getModelPath(model)
    if (!fs.existsSync(modelPath)) {
      reject(new Error(`Model not found: ${modelPath}`))
      return
    }

    // Write output to a temp JSON file so we get timestamps
    // Use an explicit output file path — newer whisper.cpp writes to cwd by default,
    // not next to the input file, so we must pass --output-file to pin the location.
    const jsonOut = wavPath.replace(/\.wav$/, '')  // whisper appends .json itself

    const args = [
      '-m', modelPath,
      '-f', wavPath,
      '--output-json',        // structured output with timestamps
      '--output-file', jsonOut, // pin output location (whisper appends .json)
      '--print-progress',     // progress % on stderr
      '--language', 'en',
      '--threads', String(Math.min(os.cpus().length, 4)),
      '--no-prints',          // suppress banner
    ]

    const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''

    proc.stderr.on('data', (d: Buffer) => {
      const line = d.toString()
      stderr += line
      // "whisper_print_progress_callback: progress = 42%"
      const match = line.match(/progress\s*=\s*(\d+)%/)
      if (match && onProgress) onProgress(parseInt(match[1], 10))
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`whisper-cli exited ${code}: ${stderr.slice(-200)}`))
        return
      }
      // Read the generated JSON file
      const jsonPath = jsonOut + '.json'
      try {
        const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
        fs.unlink(jsonPath, () => {})  // clean up

        const segments: WhisperSegment[] = (raw.transcription || []).map((s: any) => ({
          start: parseTimestamp(s.timestamps?.from || '00:00:00.000'),
          end: parseTimestamp(s.timestamps?.to || '00:00:00.000'),
          text: s.text?.trim() || '',
        }))
        const text = segments.map((s) => s.text).join(' ').trim()
        resolve({ text, segments })
      } catch (err) {
        reject(new Error(`Failed to parse whisper output: ${err}`))
      }
    })

    proc.on('error', reject)
  })
}

// "00:01:23.456" → seconds
function parseTimestamp(ts: string): number {
  const [h, m, s] = ts.split(':').map(Number)
  return h * 3600 + m * 60 + s
}

// ---------------------------------------------------------------------------
// Full pipeline: WebM blob → WAV → transcript text
// ---------------------------------------------------------------------------

/**
 * End-to-end: takes raw WebM audio bytes, converts to WAV, runs whisper,
 * returns transcript text. Cleans up temp files.
 */
export async function transcribeAudioBuffer(
  audioBuffer: ArrayBuffer,
  model = 'base.en',
  onProgress?: (step: string, percent?: number) => void,
): Promise<string> {
  const webmPath = path.join(os.tmpdir(), `keel-rec-${Date.now()}.webm`)
  let wavPath: string | null = null

  try {
    // 1. Write WebM
    fs.writeFileSync(webmPath, Buffer.from(audioBuffer))

    // 2. Convert to WAV
    onProgress?.('Converting audio…')
    wavPath = await convertToWhisperWav(webmPath)

    // 3. Transcribe
    onProgress?.('Transcribing…', 0)
    const result = await runWhisper(wavPath, model, (pct) => {
      onProgress?.('Transcribing…', pct)
    })

    return result.text
  } finally {
    if (fs.existsSync(webmPath)) fs.unlinkSync(webmPath)
    if (wavPath && fs.existsSync(wavPath)) fs.unlinkSync(wavPath)
  }
}
