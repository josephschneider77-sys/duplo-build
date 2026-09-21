import { BRICK_CATALOG, type BrickKind } from './bricks/catalog.ts'
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
  version: 1
  bricks: SavedBrick[]
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
    if (parsed.version !== 1 || !Array.isArray(parsed.bricks)) return []
    return parsed.bricks.filter(
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
  } catch {
    return []
  }
}

export function saveBuild(bricks: SavedBrick[]): void {
  try {
    const payload: SaveState = { version: 1, bricks }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota or private mode — building still works.
  }
}