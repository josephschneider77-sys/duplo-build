/**
 * Original number and letter prints for a Duplo-compatible-style builder.
 * Not affiliated with the LEGO Group or the DUPLO brand, and not a copy of
 * those prints. One glyph, centered, sitting on the plastic: a heavy rounded
 * sans with a lighter same-family fill and a thin darker outline.
 *
 * The face is Fredoka Bold, bundled at public/fonts/Fredoka-Bold.woff2 under
 * the SIL Open Font License (public/fonts/Fredoka-OFL.txt). Canvas textures
 * are drawn only after that face is active, so they never fall back to a
 * system font.
 */
import { colorById } from './colors.ts'
import { BODY_GAP, BRICK_HEIGHT, PITCH } from './dims.ts'

/** Front face of a 2×2 brick, in game units. Width matches bodySize(2, 2). */
export const STICKER_FACE_W = 2 * PITCH - BODY_GAP
export const STICKER_FACE_H = BRICK_HEIGHT

/** Pixels per game unit. 60× keeps the face on integer pixels (1878×1152). */
const STICKER_TEX_SCALE = 60

/** Cap height as a fraction of the face height. Real tall bricks are near 70%. */
const CAP_OF_FACE = 0.75
/** Outline thickness as a fraction of cap height, drawn outside the fill. */
const OUTLINE_OF_CAP = 0.07
/** "10" stays inside this fraction of the face width, tracking tightened to fit. */
const TEN_OF_WIDTH = 0.7

export const GLYPH_FONT_FAMILY = 'Duplo Sticker'

const GLYPH_IDS = new Set<string>([
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
])

/** Fill is a lighter tint of the brick; outline is a darker shade of the same family. */
const INK: Record<string, { fill: string; outline: string }> = {
  cherry: { fill: '#ffc2c6', outline: '#9e1f2d' },
  sunshine: { fill: '#fff3b8', outline: '#e0891a' },
  sky: { fill: '#d4f4ff', outline: '#1f78b4' },
  grass: { fill: '#d9ffc2', outline: '#2f8f3a' },
  grape: { fill: '#e3cffc', outline: '#5a2a9c' },
  bubblegum: { fill: '#ffd6f1', outline: '#b02d86' },
  tangerine: { fill: '#ffe0a8', outline: '#a8520c' },
  mint: { fill: '#e6fff8', outline: '#1f9a86' },
}

export function stickerInk(colorId: string): { fill: string; outline: string } {
  const id = colorById(colorId).id
  return INK[id] ?? INK.cherry
}

export function stickerTextureSize(): { width: number; height: number } {
  return {
    width: Math.round(STICKER_FACE_W * STICKER_TEX_SCALE),
    height: Math.round(STICKER_FACE_H * STICKER_TEX_SCALE),
  }
}

export function hasStickerGlyph(paintId: string): boolean {
  return GLYPH_IDS.has(paintId)
}

let fontPromise: Promise<void> | null = null

function fontUrl(): string {
  return `${import.meta.env.BASE_URL}fonts/Fredoka-Bold.woff2`
}

/** True only after Fredoka Bold is the face canvas text will use. */
export function glyphFontReady(): boolean {
  return document.fonts.check(`700 64px "${GLYPH_FONT_FAMILY}"`)
}

/**
 * Load the bundled face before any sticker canvas is painted.
 * Resolves only when that face is active. Rejects instead of substituting
 * a system font.
 */
export function ensureGlyphFont(): Promise<void> {
  if (!fontPromise) {
    fontPromise = (async () => {
      try {
        const face = new FontFace(GLYPH_FONT_FAMILY, `url(${fontUrl()})`, {
          weight: '700',
          style: 'normal',
        })
        const loaded = await face.load()
        document.fonts.add(loaded)
        await document.fonts.ready
        if (!glyphFontReady()) throw new Error('Sticker font loaded but is not active for canvas drawing')
      } catch (err) {
        fontPromise = null
        throw err
      }
    })()
  }
  return fontPromise
}

export type StickerDrawOptions = {
  /** Fill the canvas with the brick color. The 3D print leaves this off so the plastic shows through. */
  backdrop?: boolean
}

/**
 * Draw one number or letter into a canvas whose aspect matches the 2×2 face.
 * Cap height is 75% of that face. The outline is stroked at twice the desired
 * thickness and then covered by the fill, so the ring sits outside the letter
 * with round joins and does not eat the counter.
 */
export function drawStickerGlyph(
  ctx: CanvasRenderingContext2D,
  paintId: string,
  colorId: string,
  width: number,
  height: number,
  options?: StickerDrawOptions,
): boolean {
  if (!hasStickerGlyph(paintId) || !glyphFontReady()) return false
  const ink = stickerInk(colorId)
  const capPx = height * CAP_OF_FACE

  ctx.save()
  ctx.clearRect(0, 0, width, height)
  if (options?.backdrop) {
    const hex = colorById(colorId).hex
    ctx.fillStyle = `#${hex.toString(16).padStart(6, '0')}`
    ctx.fillRect(0, 0, width, height)
  }

  ctx.font = `700 ${capPx}px "${GLYPH_FONT_FAMILY}"`
  const probe = ctx.measureText('H').actualBoundingBoxAscent
  const fontPx = probe > 0 ? (capPx * capPx) / probe : capPx
  ctx.font = `700 ${fontPx}px "${GLYPH_FONT_FAMILY}"`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.miterLimit = 1

  const outline = capPx * OUTLINE_OF_CAP
  let spacing = 0
  ctx.letterSpacing = '0px'
  if (paintId === '10') {
    const limit = width * TEN_OF_WIDTH - outline * 2
    const inkWidth = (sp: number) => {
      ctx.letterSpacing = `${sp}px`
      const measured = ctx.measureText(paintId)
      return measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight
    }
    if (inkWidth(0) > limit) {
      let lo = -fontPx * 0.45
      let hi = 0
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2
        if (inkWidth(mid) > limit) hi = mid
        else lo = mid
      }
      spacing = lo
    }
  }
  ctx.letterSpacing = `${spacing}px`

  const measured = ctx.measureText(paintId)
  const fillW = measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight
  const fillH = measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent
  const alignX = (width - fillW) / 2 + measured.actualBoundingBoxLeft
  const baseline = (height - fillH) / 2 + measured.actualBoundingBoxAscent

  ctx.lineWidth = outline * 2
  ctx.strokeStyle = ink.outline
  ctx.strokeText(paintId, alignX, baseline)
  ctx.fillStyle = ink.fill
  ctx.fillText(paintId, alignX, baseline)
  ctx.restore()
  return true
}
