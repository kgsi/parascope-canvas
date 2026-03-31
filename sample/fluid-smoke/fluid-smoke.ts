import { prepareWithSegments } from '@chenglou/pretext'

// --- config ---
const BASE_FONT_SIZE = 14
const FONT_FAMILY = '"Noto Sans JP", sans-serif'
const CELL_W = 28  // fixed cell width (px)
const CELL_H = 28  // fixed cell height (px)
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 26

// Compact character set: curated for brightness range (simple → complex)
const CHARSET = '一二十人大口山川日月火木土' +
  'あいうえおかきくさしすそたつてとなのはまよりるをん' +
  'アイウカキクサシスセタチテトナハマヤユヨル' +
  '光風花雪雲星空海波道夢影色音心思知世間物事文字' +
  '動強深高速重美清暗' +
  '設計構造創技術革新変化進展未来瞬間無限' +
  '鏡響驚護議識織職構築機精確覚醒観鑑'

type PaletteEntry = {
  char: string
  brightness: number
  width: number
}

// --- brightness measurement ---
const bCvs = document.createElement('canvas')
bCvs.width = bCvs.height = 32
const bCtx = bCvs.getContext('2d', { willReadFrequently: true })!

function estimateBrightness(ch: string): number {
  bCtx.clearRect(0, 0, 32, 32)
  bCtx.font = `700 24px ${FONT_FAMILY}`
  bCtx.fillStyle = '#fff'
  bCtx.textBaseline = 'middle'
  bCtx.textAlign = 'center'
  bCtx.fillText(ch, 16, 16)
  const d = bCtx.getImageData(0, 0, 32, 32).data
  let sum = 0
  for (let i = 3; i < d.length; i += 4) sum += d[i]
  return sum / (255 * 1024)
}

// --- build palette with Pretext ---
const baseFont = `${BASE_FONT_SIZE}px ${FONT_FAMILY}`
await document.fonts.load(`400 ${BASE_FONT_SIZE}px ${FONT_FAMILY}`)
await document.fonts.load(`700 ${BASE_FONT_SIZE}px ${FONT_FAMILY}`)
await document.fonts.ready

const palette: PaletteEntry[] = []
for (const ch of CHARSET) {
  const p = prepareWithSegments(ch, baseFont)
  const width = p.widths?.length > 0 ? p.widths[0]! : 0
  if (width <= 0) continue
  palette.push({ char: ch, width, brightness: estimateBrightness(ch) })
}

const maxB = Math.max(...palette.map(p => p.brightness))
if (maxB > 0) for (const p of palette) p.brightness /= maxB
palette.sort((a, b) => a.brightness - b.brightness)

// pre-build LUT for O(1) character lookup
const LUT_SIZE = 128
const charLUT: string[] = new Array(LUT_SIZE)
for (let i = 0; i < LUT_SIZE; i++) {
  const targetB = i / (LUT_SIZE - 1)
  let best = palette[0]!
  let bestDiff = Infinity
  for (const p of palette) {
    const diff = Math.abs(p.brightness - targetB)
    if (diff < bestDiff) { bestDiff = diff; best = p }
  }
  charLUT[i] = best.char
}

function charForDensity(b: number): string {
  return charLUT[Math.min(LUT_SIZE - 1, (b * (LUT_SIZE - 1)) | 0)]!
}

// --- DOM ---
const artEl = document.getElementById('art')!
const statsEl = document.getElementById('stats')!
let COLS = 0, ROWS = 0
let rowEls: HTMLDivElement[] = []
let density: Float32Array
let tempDen: Float32Array

// font-size steps pre-computed for each density level (0-9)
const FONT_STEPS = 10
const fontSizes: number[] = []
for (let i = 0; i < FONT_STEPS; i++) {
  fontSizes.push(Math.round(MIN_FONT_SIZE + (MAX_FONT_SIZE - MIN_FONT_SIZE) * (i / (FONT_STEPS - 1))))
}

function initGrid() {
  COLS = Math.floor(window.innerWidth / CELL_W)
  ROWS = Math.floor(window.innerHeight / CELL_H)
  density = new Float32Array(COLS * ROWS)
  tempDen = new Float32Array(COLS * ROWS)
  artEl.innerHTML = ''
  rowEls = []
  for (let r = 0; r < ROWS; r++) {
    const div = document.createElement('div')
    div.className = 'r'
    div.style.height = CELL_H + 'px'
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

// --- emitters ---
const emitters = [
  { cx: 0.25, cy: 0.4, orbitR: 0.14, freq: 0.3, phase: 0, strength: 0.22 },
  { cx: 0.7, cy: 0.35, orbitR: 0.1, freq: 0.25, phase: 2.1, strength: 0.18 },
  { cx: 0.45, cy: 0.65, orbitR: 0.16, freq: 0.35, phase: 4.2, strength: 0.24 },
  { cx: 0.8, cy: 0.6, orbitR: 0.08, freq: 0.4, phase: 1, strength: 0.16 },
]

// --- mouse ---
let mouseX = -1, mouseY = -1
window.addEventListener('pointermove', e => { mouseX = e.clientX; mouseY = e.clientY })
window.addEventListener('pointerdown', e => { mouseX = e.clientX; mouseY = e.clientY })

// --- velocity field ---
function getVel(c: number, r: number, t: number): [number, number] {
  const nx = c / COLS, ny = r / ROWS
  const vx = Math.sin(ny * 6.28 + t * 0.3) * 2
    + Math.cos((nx + ny) * 12.5 + t * 0.55) * 0.7
    + Math.sin(nx * 25 + ny * 18 + t * 0.8) * 0.25
  const vy = Math.cos(nx * 5 + t * 0.4) * 1.5
    + Math.sin((nx - ny) * 10 + t * 0.4) * 0.8
    + Math.cos(nx * 18 - ny * 25 + t * 0.7) * 0.25
  return [vx, vy]
}

// --- simulation ---
function updateSim(t: number) {
  // advection
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
      const avg = (density[i - 1]! + density[i + 1]! + density[i - COLS]! + density[i + COLS]!) * 0.25
      tempDen[i] = density[i]! * 0.9 + avg * 0.1
    }
  }
  ;[density, tempDen] = [tempDen, density]

  // emitters
  const spread = 3
  for (const e of emitters) {
    const ex = (e.cx + Math.cos(t * e.freq + e.phase) * e.orbitR) * COLS
    const ey = (e.cy + Math.sin(t * e.freq * 0.7 + e.phase) * e.orbitR * 0.8) * ROWS
    const ec = ex | 0, er = ey | 0
    for (let dr = -spread; dr <= spread; dr++) {
      for (let dc = -spread; dc <= spread; dc++) {
        const rr = er + dr, cc = ec + dc
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const dist = Math.sqrt(dr * dr + dc * dc)
          const s = Math.max(0, 1 - dist / (spread + 1))
          density[rr * COLS + cc] = Math.min(1, density[rr * COLS + cc]! + s * e.strength)
        }
      }
    }
  }

  // mouse
  if (mouseX >= 0 && mouseY >= 0) {
    const mc = (mouseX / CELL_W) | 0
    const mr = (mouseY / CELL_H) | 0
    for (let dr = -3; dr <= 3; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        const rr = mr + dr, cc = mc + dc
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const dist = Math.sqrt(dr * dr + dc * dc)
          const s = Math.max(0, 1 - dist / 4)
          density[rr * COLS + cc] = Math.min(1, density[rr * COLS + cc]! + s * 0.15)
        }
      }
    }
  }

  // decay
  for (let i = 0; i < COLS * ROWS; i++) density[i]! *= 0.982
}

// --- render (DOM with variable font size) ---
let fc = 0, lastFps = 0, dispFps = 0

function render(now: number) {
  const t = now / 1000
  updateSim(t)

  for (let r = 0; r < ROWS; r++) {
    let html = ''
    for (let c = 0; c < COLS; c++) {
      const b = density[r * COLS + c]!
      if (b < 0.02) {
        html += `<span style="width:${CELL_W}px;height:${CELL_H}px"> </span>`
      } else {
        const ch = charForDensity(b)
        const sizeIdx = Math.min(FONT_STEPS - 1, (b * FONT_STEPS) | 0)
        const fs = fontSizes[sizeIdx]!
        const alpha = Math.min(1, b * 1.4).toFixed(2)
        const fw = b > 0.5 ? 700 : 400
        html += `<span style="width:${CELL_W}px;height:${CELL_H}px;font-size:${fs}px;font-weight:${fw};color:rgba(232,228,220,${alpha})">${ch}</span>`
      }
    }
    rowEls[r]!.innerHTML = html
  }

  fc++
  if (now - lastFps > 500) {
    dispFps = Math.round(fc / ((now - lastFps) / 1000))
    fc = 0; lastFps = now
    statsEl.textContent = `${COLS}×${ROWS} | ${palette.length} chars | ${dispFps} fps`
  }

  requestAnimationFrame(render)
}

console.log(`[fluid-smoke] palette: ${palette.length} chars, grid: ${COLS}×${ROWS}, cell: ${CELL_W}×${CELL_H}px`)
requestAnimationFrame(render)
