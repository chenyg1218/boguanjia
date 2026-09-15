import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export const EDGE_TTS_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女）' },
  { id: 'zh-CN-YunxiNeural', label: '云希（男）' },
  { id: 'zh-CN-XiaoyiNeural', label: '晓伊（女）' },
  { id: 'zh-CN-YunjianNeural', label: '云健（男）' },
  { id: 'zh-CN-YunyangNeural', label: '云扬（男）' },
  { id: 'zh-CN-XiaochenNeural', label: '晓辰（女）' },
  { id: 'zh-CN-XiaohanNeural', label: '晓涵（女）' },
  { id: 'zh-CN-XiaomengNeural', label: '晓梦（女）' },
  { id: 'zh-CN-XiaomoNeural', label: '晓墨（女）' },
  { id: 'zh-CN-XiaoqiuNeural', label: '晓秋（女）' },
  { id: 'zh-CN-XiaoruiNeural', label: '晓睿（女）' },
  { id: 'zh-CN-XiaoxuanNeural', label: '晓萱（女）' },
  { id: 'zh-CN-XiaoyanNeural', label: '晓颜（女）' },
  { id: 'zh-CN-XiaozhenNeural', label: '晓甄（女）' },
  { id: 'zh-CN-YunfengNeural', label: '云枫（男）' },
  { id: 'zh-CN-YunhaoNeural', label: '云皓（男）' },
  { id: 'zh-CN-YunxiaNeural', label: '云夏（男）' },
  { id: 'zh-CN-YunyeNeural', label: '云野（男）' },
  { id: 'zh-CN-YunzeNeural', label: '云泽（男）' },
] as const

/** rate: 50–150，100 为正常；映射为 Edge 倍率 */
function toEdgeRate(rate: number): number {
  const n = Number.isFinite(rate) ? rate : 100
  return Math.min(2, Math.max(0.5, n / 100))
}

/**
 * 使用 msedge-tts 合成 MP3（Edge 在线 TTS，无需 API Key）。
 */
export async function synthesizeEdgeTts(
  text: string,
  options: { voice?: string; rate?: number } = {},
): Promise<Buffer> {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('合成文本为空')
  }

  const voice = options.voice || 'zh-CN-XiaoxiaoNeural'
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)

  const { audioStream } = tts.toStream(trimmed, { rate: toEdgeRate(options.rate ?? 100) })
  const chunks: Buffer[] = []
  let settled = false

  try {
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        if (settled) return
        settled = true
        resolve()
      }
      audioStream.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      audioStream.on('end', done)
      audioStream.on('close', done)
      audioStream.on('error', (err: Error) => {
        if (settled) return
        settled = true
        reject(err)
      })
    })
  } finally {
    try {
      tts.close()
    } catch {
      /* ignore */
    }
  }

  const buf = Buffer.concat(chunks)
  if (buf.length === 0) {
    throw new Error('TTS 返回空音频')
  }
  return buf
}
