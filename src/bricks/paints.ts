import * as THREE from 'three'
import { drawStickerGlyph, hasStickerGlyph } from './glyphs.ts'

/**
 * Original chunky stickers for the front of a 2×2 brick.
 * Faces, numbers, and letters. Not copies of any LEGO or DUPLO print.
 */

export const PAINT_GROUPS = [
  { id: 'faces', label: 'Faces' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'letters', label: 'Letters' },
] as const

export type PaintGroup = (typeof PAINT_GROUPS)[number]['id']

const FACE_PAINTS = [
  { id: 'none', label: 'Plain', group: 'faces' },
  { id: 'smile', label: 'Smile', group: 'faces' },
  { id: 'grin', label: 'Grin', group: 'faces' },
  { id: 'wink', label: 'Wink', group: 'faces' },
  { id: 'sleepy', label: 'Sleepy', group: 'faces' },
  { id: 'wow', label: 'Wow', group: 'faces' },
  { id: 'shy', label: 'Shy', group: 'faces' },
  { id: 'kitty', label: 'Kitty', group: 'faces' },
  { id: 'puppy', label: 'Puppy', group: 'faces' },
] as const

const NUMBER_IDS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const

const LETTER_IDS = [
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
] as const

export type PaintId =
  | (typeof FACE_PAINTS)[number]['id']
  | (typeof NUMBER_IDS)[number]
  | (typeof LETTER_IDS)[number]

export const PAINTS: readonly { id: PaintId; label: string; group: PaintGroup }[] = [
  ...FACE_PAINTS,
  ...NUMBER_IDS.map((id) => ({ id, label: id, group: 'numbers' as const })),
  ...LETTER_IDS.map((id) => ({ id, label: id, group: 'letters' as const })),
]

export const DEFAULT_PAINT_ID: PaintId = 'none'

/** Shown when the current piece cannot take a front-face print. */
export const FACE_SKIP_TIP = 'Faces fit 2×2 bricks'

export function isPaintGroup(value: string): value is PaintGroup {
  return PAINT_GROUPS.some((group) => group.id === value)
}

export function paintsInGroup(group: PaintGroup): readonly { id: PaintId; label: string; group: PaintGroup }[] {
  return PAINTS.filter((paint) => paint.group === group && paint.id !== 'none')
}

for (const paint of PAINTS) {
  if (paint.group === 'faces') continue
  if (!hasStickerGlyph(paint.id)) throw new Error(`Missing sticker art for ${paint.id}`)
}

const INK = '#1a1a1a'
const WHITE = '#ffffff'
const PINK = '#ff6b9a'

const EYE_L = 0.34
const EYE_R = 0.66
const EYE_Y = 0.4

/** Earlier kit names from the first paint pass. */
const LEGACY_PAINT: Record<string, PaintId> = {
  bigSmile: 'grin',
  surprise: 'wow',
  silly: 'shy',
  eyes: 'none',
  heartEyes: 'none',
}

const textures = new Map<string, THREE.CanvasTexture>()

export function isPaintId(value: unknown): value is PaintId {
  return typeof value === 'string' && PAINTS.some((paint) => paint.id === value)
}

export function normalizePaintId(value: unknown): PaintId {
  if (isPaintId(value)) return value
  if (typeof value === 'string' && Object.hasOwn(LEGACY_PAINT, value)) return LEGACY_PAINT[value]
  return DEFAULT_PAINT_ID
}

export function drawFace(ctx: CanvasRenderingContext2D, paintId: string, size: number): void {
  ctx.clearRect(0, 0, size, size)
  ctx.save()
  ctx.scale(size / 256, size / 256)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (paintId === 'smile') drawSmile(ctx)
  else if (paintId === 'grin') drawGrin(ctx)
  else if (paintId === 'wink') drawWink(ctx)
  else if (paintId === 'sleepy') drawSleepy(ctx)
  else if (paintId === 'wow') drawWow(ctx)
  else if (paintId === 'shy') drawShy(ctx)
  else if (paintId === 'kitty') drawKitty(ctx)
  else if (paintId === 'puppy') drawPuppy(ctx)
  else if (!drawStickerGlyph(ctx, paintId)) drawPlain(ctx)
  ctx.restore()
}

/** Shared 256² sticker. Null for Plain or an unknown id. */
export function faceCanvasTexture(paintId: string): THREE.CanvasTexture | null {
  const id = normalizePaintId(paintId)
  if (id === 'none') return null
  const cached = textures.get(id)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawFace(ctx, id, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.premultiplyAlpha = false
  texture.needsUpdate = true
  textures.set(id, texture)
  return texture
}

function u(t: number): number {
  return t * 256
}

function dotEye(ctx: CanvasRenderingContext2D, ex: number, radius = 0.055): void {
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.arc(u(ex), u(EYE_Y), u(radius), 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = WHITE
  ctx.beginPath()
  ctx.arc(u(ex) - u(radius) * 0.32, u(EYE_Y) - u(radius) * 0.34, u(radius) * 0.32, 0, Math.PI * 2)
  ctx.fill()
}

function smileArc(ctx: CanvasRenderingContext2D, radius: number, cy: number, width = 12): void {
  ctx.strokeStyle = INK
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.arc(u(0.5), u(cy), u(radius), (20 * Math.PI) / 180, (160 * Math.PI) / 180)
  ctx.stroke()
}

function lowerLid(ctx: CanvasRenderingContext2D, ex: number): void {
  ctx.strokeStyle = INK
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.arc(u(ex), u(EYE_Y), u(0.078), (18 * Math.PI) / 180, (162 * Math.PI) / 180)
  ctx.stroke()
}

function closedLid(ctx: CanvasRenderingContext2D, ex: number): void {
  ctx.strokeStyle = INK
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.arc(u(ex), u(EYE_Y + 0.01), u(0.07), (200 * Math.PI) / 180, (340 * Math.PI) / 180)
  ctx.stroke()
}

function blush(ctx: CanvasRenderingContext2D, alpha: number): void {
  ctx.save()
  ctx.fillStyle = PINK
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.ellipse(u(0.22), u(0.5), u(0.055), u(0.034), -0.4, 0, Math.PI * 2)
  ctx.ellipse(u(0.78), u(0.5), u(0.055), u(0.034), 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function tongue(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = PINK
  ctx.beginPath()
  ctx.ellipse(u(0.5), u(0.7), u(0.065), u(0.038), 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawPlain(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = INK
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.roundRect(u(0.3), u(0.3), u(0.4), u(0.4), u(0.08))
  ctx.stroke()
}

function drawSmile(ctx: CanvasRenderingContext2D): void {
  dotEye(ctx, EYE_L)
  dotEye(ctx, EYE_R)
  smileArc(ctx, 0.14, 0.55, 12)
}

function drawGrin(ctx: CanvasRenderingContext2D): void {
  blush(ctx, 0.55)
  dotEye(ctx, EYE_L)
  dotEye(ctx, EYE_R)
  lowerLid(ctx, EYE_L)
  lowerLid(ctx, EYE_R)
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.ellipse(u(0.5), u(0.64), u(0.16), u(0.09), 0, 0, Math.PI * 2)
  ctx.fill()
  tongue(ctx)
}

function drawWink(ctx: CanvasRenderingContext2D): void {
  dotEye(ctx, EYE_L)
  closedLid(ctx, EYE_R)
  smileArc(ctx, 0.12, 0.6, 12)
}

function drawSleepy(ctx: CanvasRenderingContext2D): void {
  closedLid(ctx, EYE_L)
  closedLid(ctx, EYE_R)
  smileArc(ctx, 0.1, 0.62, 12)
}

function drawWow(ctx: CanvasRenderingContext2D): void {
  wowEye(ctx, EYE_L)
  wowEye(ctx, EYE_R)
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.arc(u(0.5), u(0.66), u(0.08), 0, Math.PI * 2)
  ctx.fill()
}

function wowEye(ctx: CanvasRenderingContext2D, ex: number): void {
  ctx.fillStyle = WHITE
  ctx.strokeStyle = INK
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.arc(u(ex), u(EYE_Y), u(0.06), 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.arc(u(ex), u(EYE_Y + 0.008), u(0.028), 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = WHITE
  ctx.beginPath()
  ctx.arc(u(ex) - u(0.01), u(EYE_Y) - u(0.004), u(0.01), 0, Math.PI * 2)
  ctx.fill()
}

function drawShy(ctx: CanvasRenderingContext2D): void {
  blush(ctx, 0.7)
  dotEye(ctx, EYE_L)
  dotEye(ctx, EYE_R)
  smileArc(ctx, 0.1, 0.62, 12)
}

function drawKitty(ctx: CanvasRenderingContext2D): void {
  tallEye(ctx, EYE_L)
  tallEye(ctx, EYE_R)
  ctx.fillStyle = PINK
  ctx.beginPath()
  ctx.ellipse(u(0.5), u(0.52), u(0.028), u(0.02), 0, 0, Math.PI * 2)
  ctx.fill()
  whiskers(ctx, -1)
  whiskers(ctx, 1)
  smileArc(ctx, 0.08, 0.64, 10)
}

function tallEye(ctx: CanvasRenderingContext2D, ex: number): void {
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.ellipse(u(ex), u(EYE_Y), u(0.04), u(0.072), 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = WHITE
  ctx.beginPath()
  ctx.arc(u(ex) - u(0.012), u(EYE_Y) - u(0.02), u(0.012), 0, Math.PI * 2)
  ctx.fill()
}

function whiskers(ctx: CanvasRenderingContext2D, side: number): void {
  ctx.strokeStyle = INK
  ctx.lineWidth = 10
  const rows = [0.5, 0.545, 0.59]
  for (const row of rows) {
    ctx.beginPath()
    ctx.moveTo(u(0.5 + side * 0.07), u(row))
    ctx.lineTo(u(0.5 + side * 0.3), u(row + side * 0.012))
    ctx.stroke()
  }
}

function drawPuppy(ctx: CanvasRenderingContext2D): void {
  blush(ctx, 0.4)
  brow(ctx, EYE_L)
  brow(ctx, EYE_R)
  dotEye(ctx, EYE_L)
  dotEye(ctx, EYE_R)
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.ellipse(u(0.5), u(0.64), u(0.16), u(0.09), 0, 0, Math.PI * 2)
  ctx.fill()
  tongue(ctx)
}

function brow(ctx: CanvasRenderingContext2D, ex: number): void {
  ctx.strokeStyle = INK
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.arc(u(ex), u(EYE_Y), u(0.095), (205 * Math.PI) / 180, (335 * Math.PI) / 180)
  ctx.stroke()
}
