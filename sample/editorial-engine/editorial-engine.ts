import {
  layoutNextLine,
  layoutWithLines,
  prepareWithSegments,
  walkLineRanges,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'

const BODY_FONT = '16px "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif'
const BODY_LINE_HEIGHT = 32
const HEADLINE_FONT_FAMILY = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif'
const HEADLINE_TEXT = 'テキストレイアウトの未来はCSSの外にある'
const GUTTER = 48
const COL_GAP = 40
const BOTTOM_GAP = 20
const DROP_CAP_LINES = 3
const MIN_SLOT_WIDTH = 50
const NARROW_BREAKPOINT = 760
const NARROW_GUTTER = 20
const NARROW_COL_GAP = 20
const NARROW_BOTTOM_GAP = 16
const NARROW_ORB_SCALE = 0.58
const NARROW_ACTIVE_ORBS = 3

type Interval = { left: number; right: number }
type PositionedLine = { x: number; y: number; width: number; text: string }

type TextProjection = {
  headlineLeft: number
  headlineTop: number
  headlineFont: string
  headlineLineHeight: number
  headlineLines: PositionedLine[]
  bodyFont: string
  bodyLineHeight: number
  bodyLines: PositionedLine[]
  pullquoteFont: string
  pullquoteLineHeight: number
  pullquoteLines: PositionedLine[]
}

type CircleObstacle = { cx: number; cy: number; r: number; hPad: number; vPad: number }
type RectObstacle = { x: number; y: number; w: number; h: number }
type PullquotePlacement = { colIdx: number; yFrac: number; wFrac: number; side: 'left' | 'right' }
type PullquoteRect = RectObstacle & { lines: PositionedLine[]; colIdx: number }
type OrbColor = [number, number, number]
type OrbDefinition = { fx: number; fy: number; r: number; vx: number; vy: number; color: OrbColor }
type Orb = { x: number; y: number; r: number; vx: number; vy: number; paused: boolean }
type HeadlineFit = { fontSize: number; lines: PositionedLine[] }
type PullquoteSpec = { prepared: PreparedTextWithSegments; placement: PullquotePlacement }
type PointerSample = { x: number; y: number }
type PointerState = { x: number; y: number }
type DragState = { orbIndex: number; startPointerX: number; startPointerY: number; startOrbX: number; startOrbY: number }
type InteractionMode = 'idle' | 'text-select'

type AppState = {
  orbs: Orb[]
  pointer: PointerState
  drag: DragState | null
  interactionMode: InteractionMode
  selectionActive: boolean
  events: { pointerDown: PointerSample | null; pointerMove: PointerSample | null; pointerUp: PointerSample | null }
  lastFrameTime: number | null
}

function getRequiredDiv(id: string): HTMLDivElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLDivElement)) throw new Error(`#${id} not found`)
  return element
}

function carveTextLineSlots(base: Interval, blocked: Interval[]): Interval[] {
  let slots = [base]
  for (let blockedIndex = 0; blockedIndex < blocked.length; blockedIndex++) {
    const interval = blocked[blockedIndex]!
    const next: Interval[] = []
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const slot = slots[slotIndex]!
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot)
        continue
      }
      if (interval.left > slot.left) next.push({ left: slot.left, right: interval.left })
      if (interval.right < slot.right) next.push({ left: interval.right, right: slot.right })
    }
    slots = next
  }
  return slots.filter(slot => slot.right - slot.left >= MIN_SLOT_WIDTH)
}

function circleIntervalForBand(
  cx: number, cy: number, r: number,
  bandTop: number, bandBottom: number,
  hPad: number, vPad: number,
): Interval | null {
  const top = bandTop - vPad
  const bottom = bandBottom + vPad
  if (top >= cy + r || bottom <= cy - r) return null
  const minDy = cy >= top && cy <= bottom ? 0 : cy < top ? top - cy : cy - bottom
  if (minDy >= r) return null
  const maxDx = Math.sqrt(r * r - minDy * minDy)
  return { left: cx - maxDx - hPad, right: cx + maxDx + hPad }
}

const BODY_TEXT = `ウェブにおけるテキストレンダリングは、三十年前に静的な文書のために設計されたパイプラインを通じて行われる。ブラウザはフォントを読み込み、テキストをグリフに整形し、合計幅を測定し、行の折り返し位置を決定し、各行を垂直に配置する。すべてのステップは前のステップに依存している。そしてすべてのステップで、レンダリングエンジンは内部のレイアウトツリーを参照しなければならない。このツリーの維持コストは非常に高く、ブラウザは同期的なリフローバリアの背後にアクセスを隠し、メインスレッドを数十ミリ秒も凍結させることがある。

ブログ記事の段落であれば、このパイプラインは目に見えない。読者の視線がアドレスバーから最初の単語に移るよりも早く、ブラウザは読み込み、レイアウト、描画を完了する。しかし、ウェブはもはや静的な文書の集合体ではない。アプリケーションのためのプラットフォームであり、それらのアプリケーションは元来のパイプラインが想定していなかった方法でテキストの情報を必要としている。

メッセージングアプリケーションは、仮想化リストをレンダリングする前に、すべてのメッセージバブルの正確な高さを知る必要がある。Masonryレイアウトは、重なりなくカードを配置するために各カードの高さが必要だ。エディトリアルページでは、画像や広告、インタラクティブな要素の周りにテキストを回り込ませる必要がある。レスポンシブなダッシュボードでは、ユーザーがパネルの仕切りをドラッグするたびにリアルタイムでテキストをリサイズし、リフローしなければならない。

これらの操作のすべてにテキスト計測が必要だ。そしてウェブにおける今日のテキスト計測は、すべて同期的なレイアウトリフローを必要とする。そのコストは壊滅的である。単一のテキストブロックの高さを測定するだけで、ブラウザはページ上のすべての要素の位置を再計算しなければならない。五百のテキストブロックを連続して測定すれば、五百回の完全なレイアウトパスが発生する。

テキスト計測にDOMがまったく不要だとしたらどうだろう。すべての行がどこで折り返されるか、各行の幅はどれだけか、テキストブロック全体の高さはどれだけか、算術だけで計算できるとしたら。

これがPretextの核心的な洞察だ。ブラウザのCanvas APIには、レイアウトリフローを一切引き起こさずに、任意のフォントでの文字列の幅を返すmeasureTextメソッドが含まれている。Canvas計測はDOMレンダリングと同じフォントエンジンを使用するため、結果は同一だ。しかし、レイアウトツリーの外部で動作するため、リフローのペナルティはない。

Pretextはこの非対称性を利用する。テキストが最初に現れるとき、Pretextはすべての単語をCanvasで一度だけ計測し、幅をキャッシュする。この準備段階の後、レイアウトは純粋な算術となる。キャッシュされた幅を走査し、累積行幅を追跡し、幅が最大値を超えたら改行を挿入し、行の高さを合計する。DOMなし。リフローなし。レイアウトツリーへのアクセスなし。

パフォーマンスの改善は段階的なものではない。DOM手法で五百のテキストブロックを計測するには十五から三十ミリ秒かかり、五百回のレイアウトリフローが発生する。Pretextでは同じ操作が〇・〇五ミリ秒で完了し、リフローはゼロだ。これは三百倍から六百倍の改善である。

DOMフリーのテキスト計測により、以前は実現不可能だったインターフェース全体のクラスが些細なものとなる。テキストは任意の形状の周りを流れることができる。ブラウザのレイアウトエンジンがサポートしているからではなく、行の幅を直接制御できるからだ。テキストの各行について、障害物によってブロックされている水平方向の区間を計算し、利用可能な幅から差し引いて、残りの幅をレイアウトエンジンに渡す。

このページを漂う光球は装飾ではない。それ自体がデモンストレーションだ。各光球は円形の障害物である。テキストの各行について、エンジンは行の垂直バンドが各光球と交差するかどうかをチェックする。交差する場合、ブロックされた水平区間を計算し、利用可能な幅から差し引く。残りの幅は二つ以上のセグメントに分割されることもあり、エンジンはすべての実行可能なスロットを埋め、障害物の両側に同時にテキストを流す。

これらすべてが単一のDOM計測なしに実行される。行の位置、幅、テキスト内容は、キャッシュされたフォントメトリクスを使用してJavaScriptで完全に計算される。唯一のDOM書き込みは、各行要素のleft、top、textContentの設定だけだ。すべてのポジショニングは明示的であるため、ブラウザがレイアウトを計算する必要はない。

オープンウェブはその野心に見合うタイポグラフィに値する。私たちはテキスト以外のあらゆる次元でネイティブソフトウェアに匹敵するアプリケーションを構築している。アニメーションは滑らかで、インタラクションはレスポンシブで、グラフィックスは見事だ。しかし私たちのテキストは硬直した箱の中に座り、障害物の周りを流れることも、動的なレイアウトに適応することも、現代のインターフェースデザインを定義する流動的な構成に参加することもできない。

テキスト計測が無料になるとき、変わるのはこれだ。少し良くなるのではない。カテゴリカルに異なるのだ。構築するにはコストが高すぎたインターフェースが些細なものとなる。印刷物にしか存在しなかったレイアウトがインタラクティブになる。箱の中に座っていたテキストが、流れ始める。`

const PULLQUOTE_TEXTS = [
  '「パフォーマンスの改善は段階的なものではない。〇・〇五ミリ秒対三十ミリ秒。ゼロリフロー対五百回。カテゴリカルに異なる。」',
  '「テキストは視覚的構成の第一級の参加者となる。静的なブロックではなく、リアルタイムで適応する流動的な素材だ。」',
]

const stage = getRequiredDiv('stage')

const orbDefs: OrbDefinition[] = [
  { fx: 0.52, fy: 0.22, r: 110, vx: 24, vy: 16, color: [196, 163, 90] },
  { fx: 0.18, fy: 0.48, r: 85, vx: -19, vy: 26, color: [100, 140, 255] },
  { fx: 0.74, fy: 0.58, r: 95, vx: 16, vy: -21, color: [232, 100, 130] },
  { fx: 0.38, fy: 0.72, r: 75, vx: -26, vy: -14, color: [80, 200, 140] },
  { fx: 0.86, fy: 0.18, r: 65, vx: -13, vy: 19, color: [150, 100, 220] },
]

function createOrbEl(color: OrbColor): HTMLDivElement {
  const element = document.createElement('div')
  element.className = 'orb'
  element.style.background = `radial-gradient(circle at 35% 35%, rgba(${color[0]},${color[1]},${color[2]},0.35), rgba(${color[0]},${color[1]},${color[2]},0.12) 55%, transparent 72%)`
  element.style.boxShadow = `0 0 60px 15px rgba(${color[0]},${color[1]},${color[2]},0.18), 0 0 120px 40px rgba(${color[0]},${color[1]},${color[2]},0.07)`
  stage.appendChild(element)
  return element
}

const W0 = window.innerWidth
const H0 = window.innerHeight

// Explicitly load all font weights before preparing text
await Promise.all([
  document.fonts.load(BODY_FONT),
  document.fonts.load(`700 72px ${HEADLINE_FONT_FAMILY}`),
  document.fonts.load(`italic 17px ${HEADLINE_FONT_FAMILY}`),
])
await document.fonts.ready

const preparedBody = prepareWithSegments(BODY_TEXT, BODY_FONT)
const PQ_FONT = `italic 17px ${HEADLINE_FONT_FAMILY}`
const PQ_LINE_HEIGHT = 28
const preparedPullquotes = PULLQUOTE_TEXTS.map(text => prepareWithSegments(text, PQ_FONT))
const pullquoteSpecs: PullquoteSpec[] = [
  { prepared: preparedPullquotes[0]!, placement: { colIdx: 0, yFrac: 0.48, wFrac: 0.52, side: 'right' } },
  { prepared: preparedPullquotes[1]!, placement: { colIdx: 1, yFrac: 0.32, wFrac: 0.5, side: 'left' } },
]
const DROP_CAP_SIZE = BODY_LINE_HEIGHT * DROP_CAP_LINES - 4
const DROP_CAP_FONT = `700 ${DROP_CAP_SIZE}px ${HEADLINE_FONT_FAMILY}`
const DROP_CAP_TEXT = BODY_TEXT[0]!
const preparedDropCap = prepareWithSegments(DROP_CAP_TEXT, DROP_CAP_FONT)

let dropCapWidth = 0
walkLineRanges(preparedDropCap, 9999, line => {
  dropCapWidth = line.width
})
const DROP_CAP_TOTAL_W = Math.ceil(dropCapWidth) + 10

const dropCapEl = document.createElement('div')
dropCapEl.className = 'drop-cap'
dropCapEl.textContent = DROP_CAP_TEXT
dropCapEl.style.font = DROP_CAP_FONT
dropCapEl.style.lineHeight = `${DROP_CAP_SIZE}px`
stage.appendChild(dropCapEl)

const linePool: HTMLSpanElement[] = []
const headlinePool: HTMLSpanElement[] = []
const pullquoteLinePool: HTMLSpanElement[] = []
const pullquoteBoxPool: HTMLDivElement[] = []
const domCache = {
  stage,
  dropCap: dropCapEl,
  bodyLines: linePool,
  headlineLines: headlinePool,
  pullquoteLines: pullquoteLinePool,
  pullquoteBoxes: pullquoteBoxPool,
  orbs: orbDefs.map(definition => createOrbEl(definition.color)),
}

const st: AppState = {
  orbs: orbDefs.map(definition => ({
    x: definition.fx * W0,
    y: definition.fy * H0,
    r: definition.r,
    vx: definition.vx,
    vy: definition.vy,
    paused: false,
  })),
  pointer: { x: -9999, y: -9999 },
  drag: null,
  interactionMode: 'idle',
  selectionActive: false,
  events: { pointerDown: null, pointerMove: null, pointerUp: null },
  lastFrameTime: null,
}

let committedTextProjection: TextProjection | null = null

function syncPool<T extends HTMLElement>(pool: T[], count: number, create: () => T): void {
  while (pool.length < count) {
    const element = create()
    stage.appendChild(element)
    pool.push(element)
  }
  for (let index = 0; index < pool.length; index++) {
    pool[index]!.style.display = index < count ? '' : 'none'
  }
}

let cachedHeadlineWidth = -1
let cachedHeadlineHeight = -1
let cachedHeadlineMaxSize = -1
let cachedHeadlineFontSize = 24
let cachedHeadlineLines: PositionedLine[] = []

function fitHeadline(maxWidth: number, maxHeight: number, maxSize: number = 72): HeadlineFit {
  if (maxWidth === cachedHeadlineWidth && maxHeight === cachedHeadlineHeight && maxSize === cachedHeadlineMaxSize) {
    return { fontSize: cachedHeadlineFontSize, lines: cachedHeadlineLines }
  }
  cachedHeadlineWidth = maxWidth
  cachedHeadlineHeight = maxHeight
  cachedHeadlineMaxSize = maxSize
  let lo = 18
  let hi = maxSize
  let best = lo
  let bestLines: PositionedLine[] = []

  while (lo <= hi) {
    const size = Math.floor((lo + hi) / 2)
    const font = `700 ${size}px ${HEADLINE_FONT_FAMILY}`
    const lineHeight = Math.round(size * 1.2)
    const prepared = prepareWithSegments(HEADLINE_TEXT, font)
    let lineCount = 0

    walkLineRanges(prepared, maxWidth, () => { lineCount++ })

    const totalHeight = lineCount * lineHeight
    if (totalHeight <= maxHeight) {
      best = size
      const result = layoutWithLines(prepared, maxWidth, lineHeight)
      bestLines = result.lines.map((line, index) => ({
        x: 0,
        y: index * lineHeight,
        text: line.text,
        width: line.width,
      }))
      lo = size + 1
    } else {
      hi = size - 1
    }
  }

  cachedHeadlineFontSize = best
  cachedHeadlineLines = bestLines
  return { fontSize: best, lines: bestLines }
}

function layoutColumn(
  prepared: PreparedTextWithSegments,
  startCursor: LayoutCursor,
  regionX: number, regionY: number, regionW: number, regionH: number,
  lineHeight: number,
  circleObstacles: CircleObstacle[],
  rectObstacles: RectObstacle[],
  singleSlotOnly: boolean = false,
): { lines: PositionedLine[]; cursor: LayoutCursor } {
  let cursor: LayoutCursor = startCursor
  let lineTop = regionY
  const lines: PositionedLine[] = []
  let textExhausted = false

  while (lineTop + lineHeight <= regionY + regionH && !textExhausted) {
    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight
    const blocked: Interval[] = []

    for (let i = 0; i < circleObstacles.length; i++) {
      const o = circleObstacles[i]!
      const interval = circleIntervalForBand(o.cx, o.cy, o.r, bandTop, bandBottom, o.hPad, o.vPad)
      if (interval !== null) blocked.push(interval)
    }
    for (let i = 0; i < rectObstacles.length; i++) {
      const rect = rectObstacles[i]!
      if (bandBottom <= rect.y || bandTop >= rect.y + rect.h) continue
      blocked.push({ left: rect.x, right: rect.x + rect.w })
    }

    const slots = carveTextLineSlots({ left: regionX, right: regionX + regionW }, blocked)
    if (slots.length === 0) { lineTop += lineHeight; continue }

    const orderedSlots = singleSlotOnly
      ? [slots.reduce((best, slot) => {
          const bw = best.right - best.left
          const sw = slot.right - slot.left
          return sw > bw ? slot : sw < bw ? best : slot.left < best.left ? slot : best
        })]
      : [...slots].sort((a, b) => a.left - b.left)

    for (let i = 0; i < orderedSlots.length; i++) {
      const slot = orderedSlots[i]!
      const slotWidth = slot.right - slot.left
      const line = layoutNextLine(prepared, cursor, slotWidth)
      if (line === null) { textExhausted = true; break }
      lines.push({ x: Math.round(slot.left), y: Math.round(lineTop), text: line.text, width: line.width })
      cursor = line.end
    }
    lineTop += lineHeight
  }
  return { lines, cursor }
}

function hitTestOrbs(orbs: Orb[], px: number, py: number, activeCount: number, radiusScale: number): number {
  for (let i = activeCount - 1; i >= 0; i--) {
    const orb = orbs[i]!
    const r = orb.r * radiusScale
    const dx = px - orb.x, dy = py - orb.y
    if (dx * dx + dy * dy <= r * r) return i
  }
  return -1
}

function pointerSampleFromEvent(event: PointerEvent): PointerSample {
  return { x: event.clientX, y: event.clientY }
}

function isSelectableTextTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.line, .headline-line, .pullquote-line') !== null
}

function hasActiveTextSelection(): boolean {
  const selection = window.getSelection()
  return selection !== null && !selection.isCollapsed && selection.rangeCount > 0
}

function clearQueuedPointerEvents(): void {
  st.events.pointerDown = null
  st.events.pointerMove = null
  st.events.pointerUp = null
}

function positionedLinesEqual(a: PositionedLine[], b: PositionedLine[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const l = a[i]!, r = b[i]!
    if (l.x !== r.x || l.y !== r.y || l.width !== r.width || l.text !== r.text) return false
  }
  return true
}

function textProjectionEqual(a: TextProjection | null, b: TextProjection): boolean {
  return a !== null &&
    a.headlineLeft === b.headlineLeft && a.headlineTop === b.headlineTop &&
    a.headlineFont === b.headlineFont && a.headlineLineHeight === b.headlineLineHeight &&
    a.bodyFont === b.bodyFont && a.bodyLineHeight === b.bodyLineHeight &&
    a.pullquoteFont === b.pullquoteFont && a.pullquoteLineHeight === b.pullquoteLineHeight &&
    positionedLinesEqual(a.headlineLines, b.headlineLines) &&
    positionedLinesEqual(a.bodyLines, b.bodyLines) &&
    positionedLinesEqual(a.pullquoteLines, b.pullquoteLines)
}

function projectTextProjection(projection: TextProjection): void {
  syncPool(domCache.headlineLines, projection.headlineLines.length, () => {
    const el = document.createElement('span'); el.className = 'headline-line'; return el
  })
  for (let i = 0; i < projection.headlineLines.length; i++) {
    const el = domCache.headlineLines[i]!, line = projection.headlineLines[i]!
    el.textContent = line.text
    el.style.left = `${projection.headlineLeft + line.x}px`
    el.style.top = `${projection.headlineTop + line.y}px`
    el.style.font = projection.headlineFont
    el.style.lineHeight = `${projection.headlineLineHeight}px`
  }

  syncPool(domCache.bodyLines, projection.bodyLines.length, () => {
    const el = document.createElement('span'); el.className = 'line'; return el
  })
  for (let i = 0; i < projection.bodyLines.length; i++) {
    const el = domCache.bodyLines[i]!, line = projection.bodyLines[i]!
    el.textContent = line.text
    el.style.left = `${line.x}px`
    el.style.top = `${line.y}px`
    el.style.font = projection.bodyFont
    el.style.lineHeight = `${projection.bodyLineHeight}px`
  }

  syncPool(domCache.pullquoteLines, projection.pullquoteLines.length, () => {
    const el = document.createElement('span'); el.className = 'pullquote-line'; return el
  })
  for (let i = 0; i < projection.pullquoteLines.length; i++) {
    const el = domCache.pullquoteLines[i]!, line = projection.pullquoteLines[i]!
    el.textContent = line.text
    el.style.left = `${line.x}px`
    el.style.top = `${line.y}px`
    el.style.font = projection.pullquoteFont
    el.style.lineHeight = `${projection.pullquoteLineHeight}px`
  }
}

function enterTextSelectionMode(): void {
  st.interactionMode = 'text-select'
  clearQueuedPointerEvents()
  st.lastFrameTime = null
  domCache.stage.style.userSelect = ''
  domCache.stage.style.webkitUserSelect = ''
  document.body.style.cursor = ''
}

function syncSelectionState(): void {
  st.selectionActive = hasActiveTextSelection()
  if (st.selectionActive) {
    enterTextSelectionMode()
  } else if (st.interactionMode === 'text-select' && st.drag === null) {
    st.interactionMode = 'idle'
  }
}

function isTextSelectionInteractionActive(): boolean {
  return st.interactionMode === 'text-select' || st.selectionActive
}

let scheduledRaf: number | null = null
function scheduleRender(): void {
  if (scheduledRaf !== null) return
  scheduledRaf = requestAnimationFrame(function renderFrame(now) {
    scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

stage.addEventListener('pointerdown', event => {
  if (isSelectableTextTarget(event.target)) {
    if (event.pointerType === 'touch') enterTextSelectionMode()
    return
  }
  const activeOrbCount = window.innerWidth < NARROW_BREAKPOINT ? NARROW_ACTIVE_ORBS : st.orbs.length
  const radiusScale = window.innerWidth < NARROW_BREAKPOINT ? NARROW_ORB_SCALE : 1
  const hitOrbIndex = hitTestOrbs(st.orbs, event.clientX, event.clientY, activeOrbCount, radiusScale)
  if (hitOrbIndex !== -1) {
    event.preventDefault()
  } else if (event.pointerType === 'touch' && st.selectionActive) {
    enterTextSelectionMode()
    return
  }
  st.events.pointerDown = pointerSampleFromEvent(event)
  scheduleRender()
})

stage.addEventListener('touchmove', event => {
  if (isTextSelectionInteractionActive()) return
  event.preventDefault()
}, { passive: false })

window.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch' && isTextSelectionInteractionActive() && st.drag === null) return
  st.events.pointerMove = pointerSampleFromEvent(event)
  scheduleRender()
})

window.addEventListener('pointerup', event => {
  if (event.pointerType === 'touch' && isTextSelectionInteractionActive() && st.drag === null) {
    syncSelectionState(); return
  }
  if (event.pointerType === 'touch') syncSelectionState()
  st.events.pointerUp = pointerSampleFromEvent(event)
  scheduleRender()
})

window.addEventListener('pointercancel', event => {
  if (event.pointerType === 'touch') syncSelectionState()
  st.events.pointerUp = pointerSampleFromEvent(event)
  scheduleRender()
})

window.addEventListener('resize', () => scheduleRender())
document.addEventListener('selectionchange', () => { syncSelectionState(); scheduleRender() })

function render(now: number): boolean {
  if (isTextSelectionInteractionActive() && st.drag === null) return false

  const pageWidth = document.documentElement.clientWidth
  const pageHeight = document.documentElement.clientHeight
  const isNarrow = pageWidth < NARROW_BREAKPOINT
  const gutter = isNarrow ? NARROW_GUTTER : GUTTER
  const colGap = isNarrow ? NARROW_COL_GAP : COL_GAP
  const bottomGap = isNarrow ? NARROW_BOTTOM_GAP : BOTTOM_GAP
  const orbRadiusScale = isNarrow ? NARROW_ORB_SCALE : 1
  const activeOrbCount = isNarrow ? Math.min(NARROW_ACTIVE_ORBS, st.orbs.length) : st.orbs.length
  const orbs = st.orbs

  let pointer = st.pointer
  let drag = st.drag
  if (st.events.pointerDown !== null) {
    const down = st.events.pointerDown
    pointer = down
    if (drag === null) {
      const orbIndex = hitTestOrbs(orbs, down.x, down.y, activeOrbCount, orbRadiusScale)
      if (orbIndex !== -1) {
        const orb = orbs[orbIndex]!
        drag = { orbIndex, startPointerX: down.x, startPointerY: down.y, startOrbX: orb.x, startOrbY: orb.y }
      }
    }
  }
  if (st.events.pointerMove !== null) {
    const move = st.events.pointerMove
    pointer = move
    if (drag !== null) {
      const orb = orbs[drag.orbIndex]!
      orb.x = drag.startOrbX + (move.x - drag.startPointerX)
      orb.y = drag.startOrbY + (move.y - drag.startPointerY)
    }
  }
  if (st.events.pointerUp !== null) {
    const up = st.events.pointerUp
    pointer = up
    if (drag !== null) {
      const dx = up.x - drag.startPointerX, dy = up.y - drag.startPointerY
      const orb = orbs[drag.orbIndex]!
      if (dx * dx + dy * dy < 16) { orb.paused = !orb.paused } else { orb.x = drag.startOrbX + dx; orb.y = drag.startOrbY + dy }
      drag = null
    }
  }

  const draggedOrbIndex = drag?.orbIndex ?? -1
  const lastFrameTime = st.lastFrameTime ?? now
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05)
  let stillAnimating = false

  for (let i = 0; i < orbs.length; i++) {
    if (i >= activeOrbCount) continue
    const orb = orbs[i]!
    const radius = orb.r * orbRadiusScale
    if (orb.paused || i === draggedOrbIndex) continue
    stillAnimating = true
    orb.x += orb.vx * dt; orb.y += orb.vy * dt
    if (orb.x - radius < 0) { orb.x = radius; orb.vx = Math.abs(orb.vx) }
    if (orb.x + radius > pageWidth) { orb.x = pageWidth - radius; orb.vx = -Math.abs(orb.vx) }
    if (orb.y - radius < gutter * 0.5) { orb.y = radius + gutter * 0.5; orb.vy = Math.abs(orb.vy) }
    if (orb.y + radius > pageHeight - bottomGap) { orb.y = pageHeight - bottomGap - radius; orb.vy = -Math.abs(orb.vy) }
  }

  for (let i = 0; i < activeOrbCount; i++) {
    const a = orbs[i]!, aR = a.r * orbRadiusScale
    for (let j = i + 1; j < activeOrbCount; j++) {
      const b = orbs[j]!, bR = b.r * orbRadiusScale
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const minDist = aR + bR + (isNarrow ? 12 : 20)
      if (dist >= minDist || dist <= 0.1) continue
      const force = (minDist - dist) * 0.8, nx = dx / dist, ny = dy / dist
      if (!a.paused && i !== draggedOrbIndex) { a.vx -= nx * force * dt; a.vy -= ny * force * dt }
      if (!b.paused && j !== draggedOrbIndex) { b.vx += nx * force * dt; b.vy += ny * force * dt }
    }
  }

  const circleObstacles: CircleObstacle[] = []
  for (let i = 0; i < activeOrbCount; i++) {
    const orb = orbs[i]!
    circleObstacles.push({ cx: orb.x, cy: orb.y, r: orb.r * orbRadiusScale, hPad: isNarrow ? 10 : 14, vPad: isNarrow ? 2 : 4 })
  }

  const headlineWidth = Math.min(pageWidth - gutter * 2 - (isNarrow ? 12 : 0), 1000)
  const maxHeadlineHeight = Math.floor(pageHeight * (isNarrow ? 0.2 : 0.24))
  const { fontSize: headlineSize, lines: headlineLines } = fitHeadline(headlineWidth, maxHeadlineHeight, isNarrow ? 32 : 72)
  const headlineLineHeight = Math.round(headlineSize * 1.2)
  const headlineFont = `700 ${headlineSize}px ${HEADLINE_FONT_FAMILY}`
  const headlineHeight = headlineLines.length * headlineLineHeight

  const bodyTop = gutter + headlineHeight + (isNarrow ? 14 : 20)
  const bodyHeight = pageHeight - bodyTop - bottomGap
  const columnCount = pageWidth > 1000 ? 3 : pageWidth > 640 ? 2 : 1
  const totalGutter = gutter * 2 + colGap * (columnCount - 1)
  const maxContentWidth = Math.min(pageWidth, 1500)
  const columnWidth = Math.floor((maxContentWidth - totalGutter) / columnCount)
  const contentLeft = Math.round((pageWidth - (columnCount * columnWidth + (columnCount - 1) * colGap)) / 2)
  const column0X = contentLeft
  const dropCapRect: RectObstacle = { x: column0X - 2, y: bodyTop - 2, w: DROP_CAP_TOTAL_W, h: DROP_CAP_LINES * BODY_LINE_HEIGHT + 2 }

  const pullquoteRects: PullquoteRect[] = []
  for (let i = 0; i < pullquoteSpecs.length; i++) {
    if (isNarrow) break
    const { prepared, placement } = pullquoteSpecs[i]!
    if (placement.colIdx >= columnCount) continue
    const pqW = Math.round(columnWidth * placement.wFrac)
    const pqLines = layoutWithLines(prepared, pqW - 20, PQ_LINE_HEIGHT).lines
    const pqH = pqLines.length * PQ_LINE_HEIGHT + 16
    const colX = contentLeft + placement.colIdx * (columnWidth + colGap)
    const pqX = placement.side === 'right' ? colX + columnWidth - pqW : colX
    const pqY = Math.round(bodyTop + bodyHeight * placement.yFrac)
    const posLines = pqLines.map((line, idx) => ({ x: pqX + 20, y: pqY + 8 + idx * PQ_LINE_HEIGHT, text: line.text, width: line.width }))
    pullquoteRects.push({ x: pqX, y: pqY, w: pqW, h: pqH, lines: posLines, colIdx: placement.colIdx })
  }

  const allBodyLines: PositionedLine[] = []
  // CJK: each character is its own segment, so skip 1 segment (not 1 grapheme)
  let cursor: LayoutCursor = { segmentIndex: 1, graphemeIndex: 0 }
  for (let colIdx = 0; colIdx < columnCount; colIdx++) {
    const colX = contentLeft + colIdx * (columnWidth + colGap)
    const rects: RectObstacle[] = []
    if (colIdx === 0) rects.push(dropCapRect)
    for (let ri = 0; ri < pullquoteRects.length; ri++) {
      const pq = pullquoteRects[ri]!
      if (pq.colIdx !== colIdx) continue
      rects.push({ x: pq.x, y: pq.y, w: pq.w, h: pq.h })
    }
    const result = layoutColumn(preparedBody, cursor, colX, bodyTop, columnWidth, bodyHeight, BODY_LINE_HEIGHT, circleObstacles, rects, isNarrow)
    allBodyLines.push(...result.lines)
    cursor = result.cursor
  }

  const pullquoteLines: PositionedLine[] = []
  for (let i = 0; i < pullquoteRects.length; i++) {
    for (let j = 0; j < pullquoteRects[i]!.lines.length; j++) {
      pullquoteLines.push(pullquoteRects[i]!.lines[j]!)
    }
  }

  const hoveredOrbIndex = hitTestOrbs(orbs, pointer.x, pointer.y, activeOrbCount, orbRadiusScale)
  const cursorStyle = drag !== null ? 'grabbing' : hoveredOrbIndex !== -1 ? 'grab' : ''

  st.pointer = pointer; st.drag = drag
  st.events.pointerDown = null; st.events.pointerMove = null; st.events.pointerUp = null
  st.lastFrameTime = stillAnimating ? now : null

  const textProjection: TextProjection = {
    headlineLeft: gutter, headlineTop: gutter,
    headlineFont, headlineLineHeight, headlineLines,
    bodyFont: BODY_FONT, bodyLineHeight: BODY_LINE_HEIGHT, bodyLines: allBodyLines,
    pullquoteFont: PQ_FONT, pullquoteLineHeight: PQ_LINE_HEIGHT, pullquoteLines,
  }

  if (!textProjectionEqual(committedTextProjection, textProjection)) {
    projectTextProjection(textProjection)
    committedTextProjection = textProjection
  }

  domCache.dropCap.style.left = `${column0X}px`
  domCache.dropCap.style.top = `${bodyTop}px`

  syncPool(domCache.pullquoteBoxes, pullquoteRects.length, () => {
    const el = document.createElement('div'); el.className = 'pullquote-box'; return el
  })
  for (let i = 0; i < pullquoteRects.length; i++) {
    const pq = pullquoteRects[i]!, el = domCache.pullquoteBoxes[i]!
    el.style.left = `${pq.x}px`; el.style.top = `${pq.y}px`
    el.style.width = `${pq.w}px`; el.style.height = `${pq.h}px`
  }

  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i]!, el = domCache.orbs[i]!
    if (i >= activeOrbCount) { el.style.display = 'none'; continue }
    const radius = orb.r * orbRadiusScale
    el.style.display = ''
    el.style.left = `${orb.x - radius}px`; el.style.top = `${orb.y - radius}px`
    el.style.width = `${radius * 2}px`; el.style.height = `${radius * 2}px`
    el.style.opacity = orb.paused ? '0.45' : '1'
  }

  domCache.stage.style.userSelect = drag !== null ? 'none' : ''
  domCache.stage.style.webkitUserSelect = drag !== null ? 'none' : ''
  document.body.style.cursor = cursorStyle
  return stillAnimating
}

scheduleRender()
