import { app } from 'electron'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as https from 'https'
import * as http from 'http'
import { getModelPath } from './modelManager'

const execFileAsync = promisify(execFile)

const REPO = 'Keel-Labs/keel'
const RELEASE_TAG = 'whisper-binaries'
const ASSET_NAME = 'whisper-macos-universal'

// Where the runtime-downloaded binary lives (writable, outside app bundle)
function getUserDataBinaryPath(): string {
  return path.join(app.getPath('userData'), 'bin', 'whisper')
}

// ---------------------------------------------------------------------------
// Binary resolution
// ---------------------------------------------------------------------------

/**
 * Returns the path to the whisper-cli binary.
 * Priority:
 *   1. Bundled binary in app extraResources (production .app)
 *   2. Runtime-downloaded binary in userData/bin/ (auto-downloaded on first run)
 *   3. Homebrew / system binary (development convenience)
 */
export function getWhisperBinary(): string | null {
  // 1. Bundled inside .app (production)
  const bundledPath = app.isPackaged
    ? path.join(process.resourcesPath, 'whisper')
    : path.join(__dirname, '../../../resources/whisper')
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

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'keel-app' } }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

function downloadFile(url: string, dest: string, onProgress?: (pct: number) => void, redirects = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'))
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'keel-app' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return resolve(downloadFile(res.headers.location!, dest, onProgress, redirects + 1))
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
      const total = parseInt(res.headers['content-length'] || '0', 10)
      let received = 0
      const file = fs.createWriteStream(dest + '.partial')
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (total && onProgress) onProgress(Math.round((received / total) * 100))
      })
      res.pipe(file)
      file.on('finish', () => { file.close(); fs.renameSync(dest + '.partial', dest); resolve() })
      file.on('error', (err) => { fs.unlink(dest + '.partial', () => {}); reject(err) })
    }).on('error', reject)
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
  const asset = release.assets?.find((a: any) => a.name === ASSET_NAME)
  if (!asset) throw new Error('Whisper binary not found in release. The build workflow may need to be run first.')

  await downloadFile(asset.browser_download_url, dest, onProgress)
  fs.chmodSync(dest, 0o755)
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
