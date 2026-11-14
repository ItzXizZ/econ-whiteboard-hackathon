// Latency probe for the local Bonsai llama-server (prints as it goes).
//   node scripts/bench-llm.mjs                 text only
//   node scripts/bench-llm.mjs 448 672         also time images of those widths
import sharp from 'sharp'

const URL_ = process.env.BONSAI_URL || 'http://127.0.0.1:8080'
const TIMEOUT_MS = Number(process.env.BENCH_TIMEOUT_MS || 180000)

export async function run(label, messages, maxTokens = 80, extra = {}) {
  const t0 = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let text = ''
  let ttft = null
  let timings = null
  try {
    const res = await fetch(`${URL_}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
        stream: true,
        cache_prompt: true,
        chat_template_kwargs: { enable_thinking: false },
        timings_per_token: true,
        ...extra,
      }),
    })
    if (!res.ok) {
      console.log(label, 'HTTP', res.status, (await res.text()).slice(0, 300))
      return ''
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line.startsWith('data:')) continue
        const p = line.slice(5).trim()
        if (p === '[DONE]') continue
        try {
          const j = JSON.parse(p)
          const d = j.choices?.[0]?.delta?.content
          if (d) {
            if (ttft == null) ttft = performance.now() - t0
            text += d
          }
          if (j.timings) timings = j.timings
        } catch {}
      }
    }
  } catch (err) {
    console.log(`\n== ${label} == FAILED after ${((performance.now() - t0) / 1000).toFixed(1)}s: ${err.name}`)
    return text
  } finally {
    clearTimeout(timer)
  }
  const total = performance.now() - t0
  console.log(`\n== ${label} ==`)
  console.log(`ttft ${((ttft ?? total) / 1000).toFixed(2)}s  total ${(total / 1000).toFixed(2)}s`)
  if (timings)
    console.log(
      `prompt ${timings.prompt_n} tok @ ${timings.prompt_per_second?.toFixed(1)} t/s (${(timings.prompt_ms / 1000).toFixed(2)}s), gen ${timings.predicted_n} tok @ ${timings.predicted_per_second?.toFixed(1)} t/s, cached ${timings.cache_n ?? 0}`
    )
  console.log(text)
  return text
}

export async function handwritingPng(lines, width = 448) {
  const fs = Math.round(width / 13)
  const lh = Math.round(fs * 1.7)
  const h = lh * lines.length + Math.round(fs * 0.8)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}">
  <rect width="100%" height="100%" fill="white"/>
  ${lines
    .map(
      (l, i) =>
        `<text x="${Math.round(width * 0.05)}" y="${lh * (i + 1) - Math.round(fs * 0.3)}" font-family="Ink Free, Segoe Print, Comic Sans MS" font-size="${fs}" fill="#111">${l
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</text>`
    )
    .join('\n  ')}
</svg>`
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

if (process.argv[1] && process.argv[1].endsWith('bench-llm.mjs')) {
  await run('text short', [{ role: 'user', content: 'In one sentence, what is market equilibrium?' }], 48)

  if (!process.argv.includes('--quick')) {
    const sys = 'You are Adam, a patient economics tutor. ' + 'Reply in the exact format requested. '.repeat(40)
    await run(
      'text ~300 tok system (cold)',
      [
        { role: 'system', content: sys },
        { role: 'user', content: 'Student wrote: Qd = 100 - 2P, Qs = 20 + 2P. Give one short hint.' },
      ],
      64
    )
    await run(
      'text ~300 tok system (warm cache)',
      [
        { role: 'system', content: sys },
        { role: 'user', content: 'Student wrote: Qd = 80 - P, Qs = 3P. Give one short hint.' },
      ],
      64
    )
  }

  const widths = process.argv.slice(2).map(Number).filter(Boolean)
  for (const w of widths) {
    const url = await handwritingPng(['Qd = 100 - 2P', 'Qs = 20 + 2P', '100 - 2P = 20 + 2P'], w)
    await run(
      `image width ${w}`,
      [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url } },
            { type: 'text', text: 'Transcribe the handwriting exactly, one line per line. Output only the text.' },
          ],
        },
      ],
      64
    )
  }
}
