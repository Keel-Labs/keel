import { app } from 'electron'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { getModelPath } from './modelManager'

const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// Binary resolution
// ---------------------------------------------------------------------------

/**
 * Returns the path to the whisper-cli binary.
 * Priority:
 *   1. Bundled binary in app extraResources (production)
 *   2. System binary installed via Homebrew (development)
 */
export function getWhisperBinary(): string | null {
  // 1. Bundled binary
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const bundledName = `whisper-${arch}`
  const bundledPath = app.isPackaged
    ? path.join(process.resourcesPath, bundledName)
    : path.join(__dirname, '../../resources', bundledName)

  if (fs.existsSync(bundledPath)) return bundledPath

  // 2. Homebrew / system binary
  const candidates = [
    '/opt/homebrew/bin/whisper-cli',   // whisper.cpp >= 1.7
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
    const jsonOut = wavPath.replace(/\.wav$/, '')  // whisper appends .json itself

    const args = [
      '-m', modelPath,
      '-f', wavPath,
      '--output-json',        // structured output with timestamps
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
