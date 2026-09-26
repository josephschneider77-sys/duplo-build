import { BOARD_FILL, framingStep, freeRect, hudInsets, useCompactFraming, type Box } from './frame.ts'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

function near(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) <= eps
}

assert(useCompactFraming(375, 667), '375×667 is a phone')
assert(useCompactFraming(390, 844), '390×844 is a phone')
assert(useCompactFraming(844, 390), '844×390 landscape is short')
assert(!useCompactFraming(1280, 800), 'desktop keeps the tuned camera')

{
  const topbar: Box = { top: 0, right: 390, bottom: 60, left: 0, width: 390, height: 60 }
  const dock: Box = { top: 700, right: 382, bottom: 836, left: 8, width: 374, height: 136 }
  const insets = hudInsets({ width: 390, height: 844 }, topbar, dock)
  assert(insets.top === 60 && insets.bottom === 144 && insets.left === 0 && insets.right === 0, `portrait insets ${JSON.stringify(insets)}`)
  const free = freeRect(390, 844, insets)
  assert(near(free.y, 60) && near(free.height, 844 - 60 - 144), `portrait free ${JSON.stringify(free)}`)
}

{
  const topbar: Box = { top: 0, right: 560, bottom: 56, left: 0, width: 560, height: 56 }
  const dock: Box = { top: 8, right: 836, bottom: 382, left: 568, width: 268, height: 374 }
  const insets = hudInsets({ width: 844, height: 390 }, topbar, dock)
  assert(near(insets.top, 56) && near(insets.right, 844 - 568) && insets.bottom === 0, `landscape insets ${JSON.stringify(insets)}`)
}

{
  // Subject already centered and the right height: no correction.
  const insets = { top: 60, right: 0, bottom: 140, left: 0 }
  const free = freeRect(390, 844, insets)
  const targetH = free.height * BOARD_FILL
  const cy = free.y + free.height / 2
  const cx = free.x + free.width / 2
  const step = framingStep({
    offsetX: 12,
    offsetY: 4,
    distance: 600,
    subject: { minX: cx - 40, maxX: cx + 40, minY: cy - targetH / 2, maxY: cy + targetH / 2 },
    viewport: { width: 390, height: 844 },
    insets,
  })
  assert(near(step.offsetX, 12) && near(step.offsetY, 4) && near(step.distance, 600), `identity ${JSON.stringify(step)}`)
}

{
  // Board sitting low under a bottom panel moves up (positive offsetY) and zooms to the free height.
  const insets = { top: 60, right: 0, bottom: 140, left: 0 }
  const free = freeRect(390, 844, insets)
  const step = framingStep({
    offsetX: 0,
    offsetY: 0,
    distance: 600,
    subject: { minX: 40, maxX: 350, minY: 620, maxY: 820 },
    viewport: { width: 390, height: 844 },
    insets,
  })
  const freeCy = free.y + free.height / 2
  assert(step.offsetY === 720 - freeCy, `shift up ${step.offsetY}`)
  assert(step.offsetY > 0, 'a low board increases offsetY so the picture moves up')
  const targetH = free.height * BOARD_FILL
  assert(near(step.distance, 600 * (200 / targetH)), `distance ${step.distance}`)
}

{
  // Right-hand side panel: subject right of the free center moves left (positive offsetX).
  const insets = { top: 56, right: 276, bottom: 8, left: 0 }
  const free = freeRect(844, 390, insets)
  const step = framingStep({
    offsetX: 0,
    offsetY: 0,
    distance: 500,
    subject: { minX: 400, maxX: 700, minY: 80, maxY: 300 },
    viewport: { width: 844, height: 390 },
    insets,
  })
  const freeCx = free.x + free.width / 2
  assert(near(step.offsetX, 550 - freeCx), `shift left ${step.offsetX}`)
  assert(step.offsetX > 0, 'a board under the right panel increases offsetX')
}

console.log('frame checks ok')
