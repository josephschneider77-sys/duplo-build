/**
 * Original chunky number and letter stickers.
 * Drawn as thick marker strokes on the same 256² canvas as the faces.
 * Not copies of any LEGO or DUPLO print.
 */

const INK = '#1a1a1a'

/** 5×7 skeletons. '#' is a joint; straight runs and open diagonals become the stroke. */
const GLYPHS: Record<string, readonly string[]> = {
  '0': [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  '2': [' ### ', '#   #', '    #', '  ## ', ' #   ', '#    ', '#####'],
  '3': [' ### ', '#   #', '    #', ' ### ', '    #', '#   #', ' ### '],
  '4': ['#   #', '#   #', '#   #', '#####', '    #', '    #', '    #'],
  '5': ['#####', '#    ', '#    ', '#### ', '    #', '#   #', ' ### '],
  '6': [' ### ', '#    ', '#    ', '#### ', '#   #', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#    '],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '    #', ' ### '],
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
  C: [' ### ', '#   #', '#    ', '#    ', '#    ', '#   #', ' ### '],
  D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
  E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
  F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
  G: [' ### ', '#   #', '#    ', '# ###', '#   #', '#   #', ' ### '],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  I: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'],
  J: ['  ###', '   # ', '   # ', '   # ', '#  # ', '#  # ', ' ##  '],
  K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '#   #', '#   #', '#   #', '#   #'],
  N: ['#   #', '##  #', '# # #', '#  ##', '#   #', '#   #', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
  Q: [' ### ', '#   #', '#   #', '#   #', '# # #', '#  # ', ' ## #'],
  R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
  U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', '#   #', ' # # ', ' # # ', '  #  '],
  X: ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
  Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
  Z: ['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#####'],
}

for (const [id, rows] of Object.entries(GLYPHS)) {
  if (rows.length !== 7 || rows.some((row) => row.length !== 5)) {
    throw new Error(`Sticker glyph ${id} must be a 5×7 skeleton`)
  }
}

export function hasStickerGlyph(paintId: string): boolean {
  return paintId === '10' || paintId === 'W' || Object.hasOwn(GLYPHS, paintId)
}

/** Draw one number or letter into the current 256² sticker space. */
export function drawStickerGlyph(ctx: CanvasRenderingContext2D, paintId: string): boolean {
  if (paintId === '10') {
    drawTen(ctx)
    return true
  }
  if (paintId === 'W') {
    drawW(ctx)
    return true
  }
  const rows = GLYPHS[paintId]
  if (!rows) return false
  drawCentered(ctx, rows, 36, 36, 26)
  return true
}

/** One continuous marker stroke so the middle peak stays clear of the feet. */
function drawW(ctx: CanvasRenderingContext2D): void {
  strokePoly(
    ctx,
    [
      [46, 28],
      [78, 226],
      [128, 112],
      [178, 226],
      [210, 28],
    ],
    28,
  )
}

function strokePoly(ctx: CanvasRenderingContext2D, points: readonly (readonly [number, number])[], brush: number): void {
  ctx.save()
  ctx.strokeStyle = INK
  ctx.lineWidth = brush
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const [x0, y0] = points[0]
  ctx.moveTo(x0, y0)
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y)
  ctx.stroke()
  ctx.restore()
}

function drawCentered(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  gapX: number,
  gapY: number,
  brush: number,
): void {
  const spanX = (rows[0].length - 1) * gapX
  const spanY = (rows.length - 1) * gapY
  drawBitmap(ctx, rows, (256 - spanX) / 2, (256 - spanY) / 2, gapX, gapY, brush)
}

/** Two full-height digits, kept chunky so "10" still fills a 2×2 face. */
function drawTen(ctx: CanvasRenderingContext2D): void {
  const gapX = 24
  const gapY = 34
  const brush = 24
  const between = 16
  const one = GLYPHS['1']
  const zero = GLYPHS['0']
  const span = (rows: readonly string[]) => (rows[0].length - 1) * gapX
  const total = span(one) + between + span(zero)
  const height = (one.length - 1) * gapY
  const x = (256 - total) / 2
  const y = (256 - height) / 2
  drawBitmap(ctx, one, x, y, gapX, gapY, brush)
  drawBitmap(ctx, zero, x + span(one) + between, y, gapX, gapY, brush)
}

function drawBitmap(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  originX: number,
  originY: number,
  gapX: number,
  gapY: number,
  brush: number,
): void {
  const on = new Set<string>()
  const pts: { c: number; r: number; x: number; y: number }[] = []
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '#') continue
      on.add(`${c},${r}`)
      pts.push({ c, r, x: originX + c * gapX, y: originY + r * gapY })
    }
  })

  ctx.save()
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  ctx.lineWidth = brush
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ] as const
  for (const p of pts) {
    for (const [dc, dr] of dirs) {
      const nc = p.c + dc
      const nr = p.r + dr
      if (!on.has(`${nc},${nr}`)) continue
      // Skip a diagonal only when both corners are filled, so counters stay open.
      if (dc !== 0 && dr !== 0 && on.has(`${nc},${p.r}`) && on.has(`${p.c},${nr}`)) continue
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(originX + nc * gapX, originY + nr * gapY)
    }
  }
  ctx.stroke()
  const radius = brush / 2
  for (const p of pts) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
