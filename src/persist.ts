import { BRICK_CATALOG, defFor, footprint, type BrickKind } from './bricks/catalog.ts'
import { BRICK_COLORS } from './bricks/colors.ts'

export const STORAGE_KEY = 'duplo-build-joe-v1'

export type SavedBrick = {
  id: string
  kind: BrickKind
  colorId: string
  ox: number
  oz: number
  rot: number
  y: number
}

export type SaveState = {
  version: 1 | 2
  bricks: SavedBrick[]
}

/**
 * Version 1 stored absolute heights from plate = 6.4 and round = one brick.
 * Plates are now half a brick (9.6) and the round is two bricks tall, so a
 * saved stack would float or sink. Re-seat each piece on whatever is already
 * under it, bottom to top. Pieces that were on the ground stay on the ground.
 * If a span used to rest on equal tops that no longer match, it sits on the
 * taller support instead of clipping through.
 */
export function reseatLegacyHeights(bricks: SavedBrick[]): SavedBrick[] {
  const sorted = [...bricks].sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const tops = new Map<string, number>()
  const nextY = new Map<string, number>()
  for (const brick of sorted) {
    const def = defFor(brick.kind)
    const { w, d } = footprint(def.studsX, def.studsZ, brick.rot)
    let support = 0
    let found = false
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < d; j++) {
        const h = tops.get(`${brick.ox + i},${brick.oz + j}`) ?? 0
        if (h > 0.05 && (!found || h > support)) {
          support = h
          found = true
        }
      }
    }
    const y = brick.y <= 0.05 ? 0 : found ? support : brick.y
    nextY.set(brick.id, y)
    const top = y + def.height
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < d; j++) {
        const key = `${brick.ox + i},${brick.oz + j}`
        tops.set(key, Math.max(tops.get(key) ?? 0, top))
      }
    }
  }
  return bricks.map((brick) => {
    const y = nextY.get(brick.id)
    return y === undefined || y === brick.y ? brick : { ...brick, y }
  })
}

function isKind(value: unknown): value is BrickKind {
  return typeof value === 'string' && BRICK_CATALOG.some((d) => d.kind === value)
}

function isColor(value: unknown): boolean {
  return typeof value === 'string' && BRICK_COLORS.some((c) => c.id === value)
}

export function loadBuild(): SavedBrick[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<SaveState>
    if ((parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.bricks)) return []
    const bricks = parsed.bricks.filter(
      (b): b is SavedBrick =>
        !!b &&
        typeof b.id === 'string' &&
        isKind(b.kind) &&
        isColor(b.colorId) &&
        Number.isFinite(b.ox) &&
        Number.isFinite(b.oz) &&
        Number.isFinite(b.rot) &&
        Number.isFinite(b.y),
    )
    return parsed.version === 1 ? reseatLegacyHeights(bricks) : bricks
  } catch {
    return []
  }
}

export function saveBuild(bricks: SavedBrick[]): void {
  try {
    const payload: SaveState = { version: 2, bricks }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota or private mode — building still works.
  }
}