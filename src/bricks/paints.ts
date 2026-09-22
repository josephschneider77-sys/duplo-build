import * as THREE from 'three'

/**
 * Original candy faces for the side of a brick.
 * Inspired by the idea of a simple printed face — not copies of any real print.
 */

export const PAINTS = [
  { id: 'none', label: 'Plain' },
  { id: 'smile', label: 'Smile' },
  { id: 'bigSmile', label: 'Big smile' },
  { id: 'wink', label: 'Wink' },
  { id: 'sleepy', label: 'Sleepy' },
  { id: 'surprise', label: 'Surprise' },
  { id: 'silly', label: 'Silly' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'heartEyes', label: 'Hearts' },
] as const

export type PaintId = (typeof PAINTS)[number]['id']

export const DEFAULT_PAINT_ID: PaintId = 'none'

const INK = '#1b1224'
const CHEEK = '#ff87b8'
const TONGUE = '#ff5c93'
const HEART = '#ff3b7a'
const WHITE = '#ffffff'

const textures = new Map<string, THREE.CanvasTexture>()

export function isPaintId(value: unknown): value is PaintId {
  return typeof value === 'string' && PAINTS.some((paint) => paint.id === value)
}

export function drawFace(ctx: CanvasRenderingContext2D, paintId: string, size: number): void {
  ctx.clearRect(0, 0, size, size)
  ctx.save()
  ctx.scale(size / 256, size / 256)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (paintId === 'smile') drawSmile(ctx)
  else if (paintId === 'bigSmile') drawBigSmile(ctx)
  else if (paintId === 'wink') drawWink(ctx)
  else if (paintId === 'sleepy') drawSleepy(ctx)
  else if (paintId === 'surprise') drawSurprise(ctx)
  else if (paintId === 'silly') drawSilly(ctx)
  else if (paintId === 'eyes') drawEyesOnly(ctx)
  else if (paintId === 'heartEyes') drawHeartEyes(ctx)
  else drawPlain(ctx)
  ctx.restore()
}

/** Shared sticker texture. Null for Plain or an unknown id. */
export function faceCanvasTexture(paintId: string): THREE.CanvasTexture | null {
  if (!isPaintId(paintId) || paintId === 'none') return null
  const cached = textures.get(paintId)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawFace(ctx, paintId, 512)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.premultiplyAlpha = false
  texture.needsUpdate = true
  textures.set(paintId, texture)
  return texture
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = WHITE
  ctx.beginPath()
  ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.36, 0, Math.PI * 2)
  ctx.fill()
}

function smileArc(ctx: CanvasRenderingContext2D, y: number, half: number, drop: number, width: number): void {
  ctx.strokeStyle = INK
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(128 - half, y)
  ctx.quadraticCurveTo(128, y + drop, 128 + half, y)
  ctx.stroke()
}

function cheeks(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.save()
  ctx.fillStyle = CHEEK
  ctx.beginPath()
  ctx.ellipse(48, y, 22, 14, -0.35, 0, Math.PI * 2)
  ctx.ellipse(208, y, 22, 14, 0.35, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function lids(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.strokeStyle = INK
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.arc(x, y + 2, r + 11, Math.PI * 1.16, Math.PI * 1.84)
  ctx.stroke()
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.arc(x, y - 1, r + 9, Math.PI * 0.18, Math.PI * 0.82)
  ctx.stroke()
}

function drawPlain(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#7b3fe4'
  ctx.lineWidth = 14
  ctx.beginPath()
  ctx.roundRect(54, 54, 148, 148, 36)
  ctx.stroke()
}

function drawSmile(ctx: CanvasRenderingContext2D): void {
  cheeks(ctx, 154)
  eye(ctx, 74, 96, 34)
  eye(ctx, 182, 96, 34)
  smileArc(ctx, 158, 58, 54, 16)
}

function drawBigSmile(ctx: CanvasRenderingContext2D): void {
  eye(ctx, 74, 68, 28)
  eye(ctx, 182, 68, 28)
  lids(ctx, 74, 68, 28)
  lids(ctx, 182, 68, 28)
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.moveTo(64, 138)
  ctx.quadraticCurveTo(128, 246, 192, 138)
  ctx.quadraticCurveTo(128, 162, 64, 138)
  ctx.closePath()
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = WHITE
  ctx.beginPath()
  ctx.ellipse(128, 152, 34, 10, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = TONGUE
  ctx.beginPath()
  ctx.ellipse(128, 198, 34, 24, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawWink(ctx: CanvasRenderingContext2D): void {
  eye(ctx, 74, 100, 32)
  ctx.strokeStyle = INK
  ctx.lineWidth = 14
  ctx.beginPath()
  ctx.moveTo(150, 112)
  ctx.quadraticCurveTo(182, 68, 216, 112)
  ctx.stroke()
  smileArc(ctx, 168, 44, 34, 14)
}

function droopyEye(ctx: CanvasRenderingContext2D, x: number): void {
  ctx.strokeStyle = INK
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.moveTo(x - 30, 86)
  ctx.quadraticCurveTo(x, 58, x + 30, 86)
  ctx.stroke()
  ctx.lineWidth = 16
  ctx.beginPath()
  ctx.moveTo(x - 34, 96)
  ctx.quadraticCurveTo(x, 150, x + 34, 96)
  ctx.stroke()
}

function drawSleepy(ctx: CanvasRenderingContext2D): void {
  droopyEye(ctx, 76)
  droopyEye(ctx, 180)
  ctx.strokeStyle = INK
  ctx.lineWidth = 14
  ctx.beginPath()
  ctx.moveTo(96, 188)
  ctx.lineTo(160, 188)
  ctx.stroke()
}

function drawSurprise(ctx: CanvasRenderingContext2D): void {
  eye(ctx, 72, 90, 36)
  eye(ctx, 184, 90, 36)
  ctx.strokeStyle = INK
  ctx.lineWidth = 16
  ctx.beginPath()
  ctx.arc(128, 186, 30, 0, Math.PI * 2)
  ctx.stroke()
}

function crossedEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, px: number, py: number): void {
  ctx.fillStyle = WHITE
  ctx.strokeStyle = INK
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.arc(x + px, y + py, r * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = WHITE
  ctx.beginPath()
  ctx.arc(x + px - r * 0.14, y + py - r * 0.14, r * 0.14, 0, Math.PI * 2)
  ctx.fill()
}

function drawSilly(ctx: CanvasRenderingContext2D): void {
  crossedEye(ctx, 74, 108, 32, 11, -4)
  crossedEye(ctx, 182, 90, 32, -11, 8)
  smileArc(ctx, 158, 52, 36, 14)
  ctx.fillStyle = TONGUE
  ctx.strokeStyle = INK
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.ellipse(172, 204, 28, 16, 0.45, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

function drawEyesOnly(ctx: CanvasRenderingContext2D): void {
  eye(ctx, 72, 128, 40)
  eye(ctx, 184, 128, 40)
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  ctx.moveTo(0, s * 0.32)
  ctx.bezierCurveTo(-s * 0.02, s * 0.02, -s * 0.58, s * 0.02, -s * 0.58, s * 0.34)
  ctx.bezierCurveTo(-s * 0.58, s * 0.64, -s * 0.12, s * 0.78, 0, s)
  ctx.bezierCurveTo(s * 0.12, s * 0.78, s * 0.58, s * 0.64, s * 0.58, s * 0.34)
  ctx.bezierCurveTo(s * 0.58, s * 0.02, s * 0.02, s * 0.02, 0, s * 0.32)
  ctx.closePath()
  ctx.fillStyle = HEART
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 8
  ctx.stroke()
  ctx.fillStyle = WHITE
  ctx.beginPath()
  ctx.ellipse(-s * 0.24, s * 0.32, s * 0.1, s * 0.06, -0.7, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawHeartEyes(ctx: CanvasRenderingContext2D): void {
  heart(ctx, 74, 58, 78)
  heart(ctx, 182, 58, 78)
  smileArc(ctx, 176, 40, 30, 13)
}
