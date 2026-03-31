import { prepare, layout, type PreparedText } from '@chenglou/pretext'
import rawThoughts from './thoughts.json'

// --- config ---
const fontFamily = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", sans-serif'
const fontSize = 14
const font = `${fontSize}px ${fontFamily}`
const lineHeight = 24
const cardPadding = 20
const gap = 14
const singleColumnMaxViewportWidth = 520

type Card = {
  text: string
  prepared: PreparedText
}

type PositionedCard = {
  cardIndex: number
  x: number
  y: number
  h: number
}

type LayoutState = {
  colWidth: number
  colCount: number
  contentHeight: number
  positionedCards: PositionedCard[]
}

// --- state ---
let desiredColWidth = 360
let multiplier = 4
let cards: Card[] = []
let animating = false
let animStartTime = 0
const ANIM_MIN_WIDTH = 80
const ANIM_MAX_WIDTH = 600
const ANIM_SPEED = 0.002 // radians per ms

function buildCards() {
  const base = rawThoughts.map(text => ({
    text,
    prepared: prepare(text, font),
  }))
  cards = []
  for (let m = 0; m < multiplier; m++) {
    for (const card of base) cards.push(card)
  }
}

// --- prepare initial cards ---
const prepareStart = performance.now()
buildCards()
const prepareTime = performance.now() - prepareStart

// --- DOM ---
const container = document.createElement('div')
container.style.position = 'relative'
document.body.appendChild(container)

const domCards: Array<HTMLDivElement | undefined> = []

// --- stats elements ---
const statTotal = document.getElementById('stat-total')!
const statDom = document.getElementById('stat-dom')!
const statDomTotal = document.getElementById('stat-dom-total')!
const statLayout = document.getElementById('stat-layout')!
const statFps = document.getElementById('stat-fps')!
const colWidthSlider = document.getElementById('col-width-slider') as HTMLInputElement
const colWidthValue = document.getElementById('col-width-value')!
const animateBtn = document.getElementById('animate-btn')!

// header height (measured once)
const header = document.querySelector('.header') as HTMLElement
let headerHeight = header.offsetHeight + 8

function computeLayout(windowWidth: number): LayoutState {
  // derive column count from desired width, then fill available space
  const usableWidth = windowWidth - gap * 2
  const colCount = Math.max(1, Math.round(usableWidth / desiredColWidth))
  const colWidth = (windowWidth - (colCount + 1) * gap) / colCount
  const textWidth = colWidth - cardPadding * 2
  const contentWidth = colCount * colWidth + (colCount - 1) * gap
  const offsetLeft = (windowWidth - contentWidth) / 2

  const colHeights = new Float64Array(colCount)
  for (let c = 0; c < colCount; c++) colHeights[c] = gap

  const positionedCards: PositionedCard[] = []
  for (let i = 0; i < cards.length; i++) {
    let shortest = 0
    for (let c = 1; c < colCount; c++) {
      if (colHeights[c]! < colHeights[shortest]!) shortest = c
    }

    const { height } = layout(cards[i]!.prepared, textWidth, lineHeight)
    const totalH = height + cardPadding * 2

    positionedCards.push({
      cardIndex: i,
      x: offsetLeft + shortest * (colWidth + gap),
      y: colHeights[shortest]! + headerHeight,
      h: totalH,
    })

    colHeights[shortest]! += totalH + gap
  }

  let contentHeight = 0
  for (let c = 0; c < colCount; c++) {
    if (colHeights[c]! > contentHeight) contentHeight = colHeights[c]!
  }

  return { colWidth, colCount, contentHeight: contentHeight + headerHeight, positionedCards }
}

function getOrCreateCardNode(cardIndex: number): HTMLDivElement {
  const existingNode = domCards[cardIndex]
  if (existingNode) return existingNode

  const node = document.createElement('div')
  node.className = 'card'
  node.textContent = cards[cardIndex]!.text
  container.appendChild(node)
  domCards[cardIndex] = node
  return node
}

// --- events ---
window.addEventListener('resize', () => {
  headerHeight = header.offsetHeight + 8
  scheduleRender()
})
window.addEventListener('scroll', () => scheduleRender(), true)

// slider: column width
colWidthSlider.addEventListener('input', () => {
  desiredColWidth = parseInt(colWidthSlider.value, 10)
  colWidthValue.textContent = `${desiredColWidth}px`
  scheduleRender()
})

// multiplier buttons
document.querySelectorAll('.multiply-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.multiply-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    multiplier = parseInt((btn as HTMLElement).dataset.mult!, 10)

    // clear existing DOM
    for (let i = 0; i < domCards.length; i++) {
      domCards[i]?.remove()
      domCards[i] = undefined
    }
    domCards.length = 0

    buildCards()
    scheduleRender()
  })
})

// --- animate toggle ---
animateBtn.addEventListener('click', () => {
  animating = !animating
  animateBtn.classList.toggle('active', animating)
  animateBtn.textContent = animating ? '⏸ Animate' : '▶ Animate'
  if (animating) {
    animStartTime = performance.now()
    colWidthSlider.disabled = true
    requestAnimationFrame(animationLoop)
  } else {
    colWidthSlider.disabled = false
  }
})

// --- FPS tracking ---
let frameTimestamps: number[] = []
function measureFps(now: number): number {
  frameTimestamps.push(now)
  // keep last 500ms of timestamps
  while (frameTimestamps.length > 0 && frameTimestamps[0]! < now - 500) {
    frameTimestamps.shift()
  }
  if (frameTimestamps.length < 2) return 0
  return Math.round((frameTimestamps.length - 1) / ((now - frameTimestamps[0]!) / 1000))
}

// --- animation loop ---
function animationLoop(now: number) {
  if (!animating) return

  const elapsed = now - animStartTime
  const t = Math.sin(elapsed * ANIM_SPEED)
  // map sin [-1, 1] → [ANIM_MIN_WIDTH, ANIM_MAX_WIDTH]
  desiredColWidth = Math.round(ANIM_MIN_WIDTH + (ANIM_MAX_WIDTH - ANIM_MIN_WIDTH) * (t * 0.5 + 0.5))
  colWidthSlider.value = `${desiredColWidth}`
  colWidthValue.textContent = `${desiredColWidth}px`

  render(now)
  requestAnimationFrame(animationLoop)
}

// --- on-demand render scheduling (non-animate mode) ---
let scheduledRaf: number | null = null
function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame(function renderFrame(now: number) {
    scheduledRaf = null
    render(now)
  })
}

function render(now?: number) {
  const windowWidth = document.documentElement.clientWidth
  const windowHeight = document.documentElement.clientHeight
  const scrollTop = window.scrollY

  const t0 = performance.now()
  const layoutState = computeLayout(windowWidth)
  const layoutTime = performance.now() - t0

  container.style.height = `${layoutState.contentHeight}px`

  const viewTop = scrollTop - 300
  const viewBottom = scrollTop + windowHeight + 300
  const visibleFlags = new Uint8Array(cards.length)
  let visibleCount = 0

  for (let i = 0; i < layoutState.positionedCards.length; i++) {
    const pc = layoutState.positionedCards[i]!
    if (pc.y > viewBottom || pc.y + pc.h < viewTop) continue

    visibleFlags[pc.cardIndex] = 1
    visibleCount++
    const node = getOrCreateCardNode(pc.cardIndex)
    node.style.left = `${pc.x}px`
    node.style.top = `${pc.y}px`
    node.style.width = `${layoutState.colWidth}px`
    node.style.height = `${pc.h}px`
  }

  for (let i = 0; i < domCards.length; i++) {
    const node = domCards[i]
    if (node && visibleFlags[i] === 0) {
      node.remove()
      domCards[i] = undefined
    }
  }

  // update stats
  statTotal.textContent = `${cards.length}`
  statDom.textContent = `${visibleCount}`
  statDomTotal.textContent = `${cards.length}`
  statLayout.textContent = layoutTime.toFixed(2)
  statLayout.className = layoutTime < 1 ? 'value fast' : layoutTime < 5 ? 'value' : 'value slow'

  if (now != null) {
    const fps = measureFps(now)
    statFps.textContent = `${fps}`
    statFps.className = fps >= 55 ? 'value fast' : fps >= 30 ? 'value' : 'value slow'
  }
}

// show initial prepare time in console
console.log(`[pretext] prepare ${cards.length} cards: ${prepareTime.toFixed(1)}ms`)

scheduleRender()
