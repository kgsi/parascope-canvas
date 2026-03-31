import { prepareWithSegments } from '@chenglou/pretext'

// --- config ---
const FONT_SIZE = 16
const LINE_HEIGHT = 20
const FONT_FAMILY = '"Noto Sans JP", sans-serif'
const WEIGHTS = [400, 700]

// Japanese character set: low density (simple strokes) → high density (complex strokes)
const CHARSET = '一二三十人大口子山川日月火水木金土中天田力八目上下左右手足耳見出立入小少四五六七九百千万気生年何時今白' +
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん' +
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  '光風花雪雨雲星空海波道時夢影色音声心思知世間場所物事言話語文字書読記写真実新古明暗' +
  '動静強弱深浅高低長短広狭速遅重軽美醜善悪正誤清濁寒暖乾湿' +
  '設計構造創造技術革新変化進化発展未来過去現在瞬間永遠無限' +
  '鏡響驚護議論識織職権構築機械器精確認識覚醒繊維観測量鑑定'

type PaletteEntry = {
  char: string
  weight: number
  font: string
  width: number
  brightness: number
}

// --- brightness measurement ---
const bCvs = document.createElement('canvas')
bCvs.width = bCvs.height = 32
const bCtx = bCvs.getContext('2d', { willReadFrequently: true })!

function estimateBrightness(ch: string, font: string): number {
  bCtx.clearRect(0, 0, 32, 32)
  bCtx.font = font
  bCtx.fillStyle = '#fff'
  bCtx.textBaseline = 'middle'
  bCtx.fillText(ch, 2, 16)
  const d = bCtx.getImageData(0, 0, 32, 32).data
  let sum = 0
  for (let i = 3; i < d.length; i += 4) sum += d[i]
  return sum / (255 * 1024)
}

// --- build palette ---
await document.fonts.load(`400 ${FONT_SIZE}px ${FONT_FAMILY}`)
await document.fonts.load(`700 ${FONT_SIZE}px ${FONT_FAMILY}`)
await document.fonts.ready

const palette: PaletteEntry[] = []
for (const weight of WEIGHTS) {
  const font = `${weight} ${FONT_SIZE}px ${FONT_FAMILY}`
  for (const ch of CHARSET) {
    const p = prepareWithSegments(ch, font)
    const width = p.widths?.length > 0 ? p.widths[0]! : 0
    if (width <= 0) continue
    palette.push({
      char: ch,
      weight,
      font,
      width,
      brightness: estimateBrightness(ch, font),
    })
  }
}

// normalize and sort by brightness
const maxB = Math.max(...palette.map(p => p.brightness))
if (maxB > 0) for (const p of palette) p.brightness /= maxB
palette.sort((a, b) => a.brightness - b.brightness)

const avgCharW = palette.reduce((s, p) => s + p.width, 0) / palette.length
const aspect = avgCharW / LINE_HEIGHT
const aspect2 = aspect * aspect
const spaceW = FONT_SIZE * 0.5 // CJK space is wider

function findBest(targetB: number, targetW: number): PaletteEntry {
  let lo = 0, hi = palette.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (palette[mid]!.brightness < targetB) lo = mid + 1
    else hi = mid
  }
  let bestScore = Infinity, best = palette[lo]!
  for (let i = Math.max(0, lo - 20); i < Math.min(palette.length, lo + 20); i++) {
    const p = palette[i]!
    const score = Math.abs(p.brightness - targetB) * 2.5 + Math.abs(p.width - targetW) / targetW
    if (score < bestScore) { bestScore = score; best = p }
  }
  return best
}

function esc(c: string): string {
  if (c === '&') return '&amp;'
  if (c === '<') return '&lt;'
  if (c === '>') return '&gt;'
  return c
}

function wCls(w: number): string {
  return w === 400 ? 'w4' : 'w7'
}

// --- grid ---
const MAX_COLS = 140
const MAX_ROWS = 70
const artEl = document.getElementById('art')!
const statsEl = document.getElementById('stats')!
let COLS = 0
let ROWS = 0
let rowEls: HTMLDivElement[] = []
let density: Float32Array
let tempDen: Float32Array

// --- emitters ---
const emitters = [
  { cx: 0.25, cy: 0.4, orbitR: 0.14, freq: 0.3, phase: 0, strength: 0.18 },
  { cx: 0.7, cy: 0.35, orbitR: 0.1, freq: 0.25, phase: 2.1, strength: 0.15 },
  { cx: 0.45, cy: 0.65, orbitR: 0.16, freq: 0.35, phase: 4.2, strength: 0.2 },
  { cx: 0.8, cy: 0.6, orbitR: 0.08, freq: 0.4, phase: 1, strength: 0.14 },
]

// --- mouse state ---
let mouseX = -1, mouseY = -1
let prevMouseX = -1, prevMouseY = -1

window.addEventListener('pointermove', e => {
  prevMouseX = mouseX; prevMouseY = mouseY
  mouseX = e.clientX; mouseY = e.clientY
})
window.addEventListener('pointerdown', e => {
  mouseX = e.clientX; mouseY = e.clientY
  prevMouseX = mouseX; prevMouseY = mouseY
})

// --- velocity field ---
function getVel(c: number, r: number, t: number): [number, number] {
  const nx = c / COLS, ny = r / ROWS
  let vx = Math.sin(ny * 6.28 + t * 0.3) * 2
    + Math.cos((nx + ny) * 12.5 + t * 0.55) * 0.7
    + Math.sin(nx * 25 + ny * 18 + t * 0.8) * 0.25
  let vy = Math.cos(nx * 5 + t * 0.4) * 1.5
    + Math.sin((nx - ny) * 10 + t * 0.4) * 0.8
    + Math.cos(nx * 18 - ny * 25 + t * 0.7) * 0.25
  vy *= aspect
  return [vx, vy]
}

// --- simulation ---
function updateSim(t: number) {
  // advection (semi-Lagrangian)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const [vx, vy] = getVel(c, r, t)
      const sx = Math.max(0, Math.min(COLS - 1.001, c - vx))
      const sy = Math.max(0, Math.min(ROWS - 1.001, r - vy))
      const x0 = sx | 0, y0 = sy | 0
      const x1 = Math.min(x0 + 1, COLS - 1), y1 = Math.min(y0 + 1, ROWS - 1)
      const fx = sx - x0, fy = sy - y0
      tempDen[r * COLS + c] =
        density[y0 * COLS + x0]! * (1 - fx) * (1 - fy) +
        density[y0 * COLS + x1]! * fx * (1 - fy) +
        density[y1 * COLS + x0]! * (1 - fx) * fy +
        density[y1 * COLS + x1]! * fx * fy
    }
  }
  ;[density, tempDen] = [tempDen, density]

  // diffusion
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      const i = r * COLS + c
      const avg = (density[i - 1]! + density[i + 1]! +
        (density[i - COLS]! + density[i + COLS]!) * aspect2) / (2 + 2 * aspect2)
      tempDen[i] = density[i]! * 0.92 + avg * 0.08
    }
  }
  ;[density, tempDen] = [tempDen, density]

  // emitter sources
  const spread = 4
  for (const e of emitters) {
    const ex = (e.cx + Math.cos(t * e.freq + e.phase) * e.orbitR) * COLS
    const ey = (e.cy + Math.sin(t * e.freq * 0.7 + e.phase) * e.orbitR * 0.8) * ROWS
    const ec = ex | 0, er = ey | 0
    for (let dr = -spread; dr <= spread; dr++) {
      for (let dc = -spread; dc <= spread; dc++) {
        const rr = er + dr, cc = ec + dc
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const drScaled = dr / aspect
          const dist = Math.sqrt(drScaled * drScaled + dc * dc)
          const s = Math.max(0, 1 - dist / (spread + 1))
          density[rr * COLS + cc] = Math.min(1, density[rr * COLS + cc]! + s * e.strength)
        }
      }
    }
  }

  // mouse interaction: add density and disturbance
  if (mouseX >= 0 && mouseY >= 0) {
    const mc = Math.floor(mouseX / avgCharW)
    const mr = Math.floor(mouseY / LINE_HEIGHT)
    const mSpread = 5
    for (let dr = -mSpread; dr <= mSpread; dr++) {
      for (let dc = -mSpread; dc <= mSpread; dc++) {
        const rr = mr + dr, cc = mc + dc
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const dist = Math.sqrt(dr * dr + dc * dc)
          const s = Math.max(0, 1 - dist / (mSpread + 1))
          density[rr * COLS + cc] = Math.min(1, density[rr * COLS + cc]! + s * 0.12)
        }
      }
    }
  }

  // decay
  for (let i = 0; i < COLS * ROWS; i++) density[i]! *= 0.984
}

// --- grid init ---
function initGrid() {
  COLS = Math.min(MAX_COLS, Math.floor(window.innerWidth / avgCharW))
  ROWS = Math.min(MAX_ROWS, Math.floor(window.innerHeight / LINE_HEIGHT))
  density = new Float32Array(COLS * ROWS)
  tempDen = new Float32Array(COLS * ROWS)
  artEl.innerHTML = ''
  rowEls = []
  for (let r = 0; r < ROWS; r++) {
    const div = document.createElement('div')
    div.className = 'r'
    div.style.height = div.style.lineHeight = LINE_HEIGHT + 'px'
    div.style.fontSize = FONT_SIZE + 'px'
    artEl.appendChild(div)
    rowEls.push(div)
  }
}

let resizeTimer = 0
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(initGrid, 150)
})

initGrid()

// --- render loop ---
let fc = 0
let lastFps = 0
let dispFps = 0

function render(now: number) {
  const t = now / 1000
  updateSim(t)
  const tcw = window.innerWidth / COLS

  for (let r = 0; r < ROWS; r++) {
    let html = ''
    for (let c = 0; c < COLS; c++) {
      const b = density[r * COLS + c]!
      if (b < 0.025) {
        html += '\u3000' // full-width space for CJK grid alignment
      } else {
        const m = findBest(b, tcw)
        const ai = Math.max(1, Math.min(10, Math.round(b * 10)))
        html += `<span class="${wCls(m.weight)} a${ai}">${esc(m.char)}</span>`
      }
    }
    rowEls[r]!.innerHTML = html
  }

  // FPS
  fc++
  if (now - lastFps > 500) {
    dispFps = Math.round(fc / ((now - lastFps) / 1000))
    fc = 0
    lastFps = now
    statsEl.textContent = `${COLS}×${ROWS} | ${palette.length} chars | ${dispFps} fps`
  }

  requestAnimationFrame(render)
}

console.log(`[fluid-smoke] palette: ${palette.length} chars, avgW: ${avgCharW.toFixed(1)}px, grid: ${COLS}×${ROWS}`)
requestAnimationFrame(render)
