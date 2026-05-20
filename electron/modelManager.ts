import { app, net } from 'electron'
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

function describeNetError(err: Error): Error {
  const msg = err.message || ''
  if (/ERR_CERT|certificate|issuer/i.test(msg)) {
    return new Error(
      `Network certificate validation failed (${msg}). If you're on a corporate VPN or behind antivirus HTTPS inspection, install that root certificate in Windows Trusted Root Certification Authorities or use a different network.`
    )
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|fetch failed|network/i.test(msg)) {
    return new Error(`Couldn't reach huggingface.co to download the model (${msg}). Check your internet connection.`)
  }
  if (/HTTP 5\d\d/.test(msg)) {
    return new Error(`HuggingFace returned a server error (${msg}). Try again in a minute.`)
  }
  if (/HTTP 4\d\d/.test(msg)) {
    return new Error(`HuggingFace refused the request (${msg}). The model URL may have changed — please report this.`)
  }
  return err
}

function isRetryable(err: Error): boolean {
  const msg = err.message || ''
  if (/Aborted/i.test(msg)) return false
  if (/HTTP 4\d\d/.test(msg)) return false  // 4xx won't fix itself by retrying
  return true
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function downloadWithElectronNet(
  url: string,
  tmpPath: string,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Aborted')); return }

    const req = net.request({ method: 'GET', url, redirect: 'follow' })
    const abort = () => {
      req.abort()
      reject(new Error('Aborted'))
    }
    signal?.addEventListener('abort', abort, { once: true })

    req.on('response', (res) => {
      if (res.statusCode !== 200) {
        signal?.removeEventListener('abort', abort)
        reject(new Error(`HTTP ${res.statusCode} downloading model`))
        return
      }

      const total = parseInt((res.headers['content-length'] as string) || '0', 10)
      let received = 0
      const file = fs.createWriteStream(tmpPath)
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (total) onProgress(Math.round((received / total) * 100))
        file.write(chunk)
      })
      res.on('end', () => {
        file.end()
        file.on('close', () => {
          signal?.removeEventListener('abort', abort)
          resolve()
        })
      })
      res.on('error', (err: Error) => {
        file.destroy()
        fs.unlink(tmpPath, () => {})
        signal?.removeEventListener('abort', abort)
        reject(describeNetError(err))
      })
    })
    req.on('error', (err: Error) => {
      fs.unlink(tmpPath, () => {})
      signal?.removeEventListener('abort', abort)
      reject(describeNetError(err))
    })
    req.end()
  })
}

/**
 * Download a GGML model to the user's Application Support folder.
 * Calls onProgress with 0–100 as download proceeds.
 * Follows HuggingFace redirects automatically.
 */
function downloadWithNodeHttps(
  url: string,
  tmpPath: string,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
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
          resolve()
        })
        file.on('error', (err) => {
          fs.unlink(tmpPath, () => {})
          reject(describeNetError(err as Error))
        })
      })
      req.on('error', (err) => reject(describeNetError(err as Error)))
      if (signal) signal.addEventListener('abort', () => { req.destroy(); reject(new Error('Aborted')) })
    }

    doGet(url)
  })
}

/**
 * Download a GGML model to the user's Application Support folder.
 * Calls onProgress with 0–100 as download proceeds.
 * Follows HuggingFace redirects automatically and retries on transient
 * network errors with exponential backoff.
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

  // Stale partial from a previous interrupted run — start clean.
  if (fs.existsSync(tmpPath)) {
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
  }

  const useElectron = typeof net.request === 'function'
  const MAX_ATTEMPTS = 3
  let lastErr: Error | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw new Error('Aborted')
    try {
      if (useElectron) {
        await downloadWithElectronNet(url, tmpPath, onProgress, signal)
      } else {
        await downloadWithNodeHttps(url, tmpPath, onProgress, signal)
      }
      fs.renameSync(tmpPath, destPath)
      return destPath
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      // Always remove the partial between attempts so we don't union two
      // failed bodies into one corrupt file.
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch { /* ignore */ }
      lastErr = error
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS) break
      // Backoff: 1s, 2s, 4s — capped.
      await sleep(1000 * Math.pow(2, attempt - 1))
    }
  }

  throw describeNetError(lastErr || new Error('Model download failed'))
}

/** Delete a downloaded model to free disk space */
export function deleteModel(model: string): void {
  const p = getModelPath(model)
  if (fs.existsSync(p)) fs.unlinkSync(p)
}
