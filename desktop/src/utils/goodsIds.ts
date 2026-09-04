const MAX_GOODS_ID = 200

/**
 * 解析批量商品序号：支持 `2`、`2-4`、`1,3,5`、`1，3-5`。
 * 去重保序，序号范围 1～200。
 */
export function parseGoodsIdBatch(text: string): number[] {
  const raw = (text || '').trim()
  if (!raw) return []

  const out: number[] = []
  for (const part of raw.split(/[,，、\s]+/)) {
    const token = part.trim()
    if (!token) continue

    const range = token.match(/^(\d+)\s*[-~～到至]\s*(\d+)$/)
    if (range) {
      let a = Number(range[1])
      let b = Number(range[2])
      if (a > b) [a, b] = [b, a]
      for (let n = a; n <= b; n++) out.push(n)
      continue
    }

    if (/^\d+$/.test(token)) {
      out.push(Number(token))
    }
  }

  const seen = new Set<number>()
  const uniq: number[] = []
  for (const n of out) {
    if (n < 1 || n > MAX_GOODS_ID || seen.has(n)) continue
    seen.add(n)
    uniq.push(n)
  }
  return uniq
}
