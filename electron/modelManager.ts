import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as https from 'https'
import * as http from 'http'

const MODELS_DIR = path.join(app.getPath('userData'), 'whisper-models')

const MODEL_URLS: Record<string, string> = {
  'base.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
  'small.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
  'tiny.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
}

const MODEL_SIZES: Record<string, number> = {
  'tiny.en': 75_000_000,
  'base.en': 142_000_000,
  'small.en': 466_000_000,
}

export function getModelsDir(): string {
  return MODELS_DIR
}

export function getModelPath(model = 'base.en'): string {
  return path.join(MODELS_DIR, `ggml-${model}.bin`)
}

export function isModelDownloaded(model = 'base.en'): boolean {
  const p = getModelPath(model)
  if (!fs.existsSync(p)) return false
  // Check the file is not a partial download (> 10% of expected size)
  const expected = MODEL_SIZES[model]
  if (expected) {
    const actual = fs.statSync(p).size
    if (actual < expected * 0.1) return false
  }
  return true
}

export function getAvailableModels(): Array<{ id: string; downloaded: boolean; sizeMb: number }> {
  return Object.keys(MODEL_URLS).map((id) => ({
    id,
    downloaded: isModelDownloaded(id),
    sizeMb: Math.round((MODEL_SIZES[id] || 0) / 1_000_000),
  }))
}

/**
 * Download a GGML model to the user's Application Support folder.
 * Calls onProgress with 0–100 as download proceeds.
 * Follows HuggingFace redirects automatically.
 */
export async function downloadModel(
  model = 'base.en',
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  fs.mkdirSync(MODELS_DIR, { recursive: true })
  const destPath = getModelPath(model)
  const tmpPath = destPath + '.partial'
  const url = MODEL_URLS[model]
  if (!url) throw new Error(`Unknown model: ${model}`)

  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Aborted')); return }

    const doGet = (targetUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) { reject(new Error('Too many redirects')); return }
      const mod = targetUrl.startsWith('https') ? https : http
      const req = mod.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          doGet(res.headers.location!, redirectCount + 1)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading model`))
          return
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const file = fs.createWriteStream(tmpPath)
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (total) onProgress(Math.round((received / total) * 100))
        })
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          fs.renameSync(tmpPath, destPath)
          resolve(destPath)
        })
        file.on('error', (err) => {
          fs.unlink(tmpPath, () => {})
          reject(err)
        })
      })
      req.on('error', reject)
      if (signal) signal.addEventListener('abort', () => { req.destroy(); reject(new Error('Aborted')) })
    }

    doGet(url)
  })
}

/** Delete a downloaded model to free disk space */
export function deleteModel(model: string): void {
  const p = getModelPath(model)
  if (fs.existsSync(p)) fs.unlinkSync(p)
}
