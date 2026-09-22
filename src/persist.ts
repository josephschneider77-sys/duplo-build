import { BRICK_CATALOG, BrickKind, brickAcceptsFace, defFor, footprint, type BrickKind as BrickKindId } from './bricks/catalog.ts'
import { BRICK_COLORS } from './bricks/colors.ts'
import { BASEPLATE_STUDS, BRICK_HEIGHT, boardOrigin } from './bricks/dims.ts'
import { DEFAULT_PAINT_ID, normalizePaintId } from './bricks/paints.ts'

export const STORAGE_KEY = 'duplo-build-joe-v1'

export type SavedBrick = {
  id: string
  kind: BrickKindId
  colorId: string
  /** Face print. Missing on older saves; those load as Plain. */
  paintId: string
  ox: number
  oz: number
  rot: number
  y: number
}

/** Retired 3×2 roof tile (35114). Loads become the 2×2×1½ slope. */
const LEGACY_SLOPE_KIND = 'slope2x3'

type ParsedBrick = Omit<SavedBrick, 'kind'> & { kind: BrickKindId | typeof LEGACY_SLOPE_KIND }

export type SaveState = {
  /**
   * 3 adds paintId. 1 and 2 still load; a missing paintId becomes Plain.
   * 4 records `boardStuds`. Older saves were written on the 24×24 plate.
   */
  version: 1 | 2 | 3 | 4
  /** Studs along one edge of the plate this build was saved on. */
  boardStuds?: number
  bricks: SavedBrick[]
}

/** Versions 1–3 were saved when the playable plate was 24×24. */
const LEGACY_PLATE_STUDS = 24

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

function isKind(value: unknown): value is BrickKindId {
  return typeof value === 'string' && BRICK_CATALOG.some((d) => d.kind === value)
}

function isStoredKind(value: unknown): value is ParsedBrick['kind'] {
  return value === LEGACY_SLOPE_KIND || isKind(value)
}

function clampOrigin(value: number, span: number): number {
  const origin = boardOrigin()
  const max = origin + BASEPLATE_STUDS - span
  return Math.min(max, Math.max(origin, Math.round(value)))
}

function plateOrigin(studs: number): number {
  return -Math.floor(studs / 2)
}

/** True when at least one stud cell of the footprint lies on a centered plate. */
function overlapsPlate(ox: number, oz: number, w: number, d: number, studs: number): boolean {
  const origin = plateOrigin(studs)
  const max = origin + studs
  return ox + w > origin && ox < max && oz + d > origin && oz < max
}

/** Versions 1–3 omit `boardStuds`; those builds sat on the 24×24 plate. */
function plateStudsFromSave(version: unknown, boardStuds: unknown): number {
  if (version === 4 && typeof boardStuds === 'number' && Number.isFinite(boardStuds)) {
    const studs = Math.floor(boardStuds)
    if (studs >= 2 && studs <= 256) return studs
  }
  return LEGACY_PLATE_STUDS
}

/**
 * Design 6474 replaced 35114. Keep the stud origin and rotation, shrink the
 * footprint onto the board, and lift anything that was sitting on the old
 * one-brick roof so it rests on the taller slope. Pieces that only used the
 * dropped third stud stay where they were — nothing is removed.
 */
export function migrateLegacySlopes(bricks: ParsedBrick[]): SavedBrick[] {
  const migratedIds = new Set<string>()
  const rewritten: SavedBrick[] = bricks.map((brick) => {
    if (brick.kind !== LEGACY_SLOPE_KIND) return { ...brick, kind: brick.kind }
    migratedIds.add(brick.id)
    const { w, d } = footprint(2, 2, brick.rot)
    return {
      ...brick,
      kind: BrickKind.Slope2x2,
      ox: clampOrigin(brick.ox, w),
      oz: clampOrigin(brick.oz, d),
    }
  })
  if (migratedIds.size === 0) return rewritten

  const sorted = [...rewritten].sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const cells = new Map<string, { histTop: number; added: number }>()
  const shift = new Map<string, number>()
  for (const brick of sorted) {
    const def = defFor(brick.kind)
    const { w, d } = footprint(def.studsX, def.studsZ, brick.rot)
    let added = 0
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < d; j++) {
        const cell = cells.get(`${brick.ox + i},${brick.oz + j}`)
        if (cell && Math.abs(brick.y - cell.histTop) <= 0.05) added = Math.max(added, cell.added)
      }
    }
    shift.set(brick.id, added)
    const migrated = migratedIds.has(brick.id)
    const histH = migrated ? BRICK_HEIGHT : def.height
    const histTop = brick.y + histH
    const cellAdded = added + (migrated ? BRICK_HEIGHT * 0.5 : 0)
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < d; j++) {
        const key = `${brick.ox + i},${brick.oz + j}`
        const prev = cells.get(key)
        if (!prev || histTop >= prev.histTop - 0.05) cells.set(key, { histTop, added: cellAdded })
      }
    }
  }
  return rewritten.map((brick) => {
    const dy = shift.get(brick.id) ?? 0
    return dy > 0 ? { ...brick, y: brick.y + dy } : brick
  })
}

function isColor(value: unknown): boolean {
  return typeof value === 'string' && BRICK_COLORS.some((c) => c.id === value)
}

export function loadBuild(): SavedBrick[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { version?: unknown; boardStuds?: unknown; bricks?: unknown }
    if (
      (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4) ||
      !Array.isArray(parsed.bricks)
    ) {
      return []
    }
    const savedStuds = plateStudsFromSave(parsed.version, parsed.boardStuds)
    const bricks = parsed.bricks.flatMap((b): ParsedBrick[] => {
      if (!b || typeof b !== 'object') return []
      const brick = b as Record<string, unknown>
      if (
        typeof brick.id !== 'string' ||
        !isStoredKind(brick.kind) ||
        !isColor(brick.colorId) ||
        !Number.isFinite(brick.ox) ||
        !Number.isFinite(brick.oz) ||
        !Number.isFinite(brick.rot) ||
        !Number.isFinite(brick.y)
      ) {
        return []
      }
      return [
        {
          id: brick.id,
          kind: brick.kind,
          colorId: brick.colorId as string,
          paintId: normalizePaintId(brick.paintId),
          ox: brick.ox as number,
          oz: brick.oz as number,
          rot: brick.rot as number,
          y: brick.y as number,
        },
      ]
    })
    const migrated = migrateLegacySlopes(bricks)
    const seated = parsed.version === 1 ? reseatLegacyHeights(migrated) : migrated
    return seated.flatMap((brick) => {
      const def = defFor(brick.kind)
      const { w, d } = footprint(def.studsX, def.studsZ, brick.rot)
      // Keep a brick only if it was on the plate it was saved against and still
      // meets the plate we play on. A 24×24 save cannot invent pieces in the new ring.
      if (!overlapsPlate(brick.ox, brick.oz, w, d, savedStuds)) return []
      if (!overlapsPlate(brick.ox, brick.oz, w, d, BASEPLATE_STUDS)) return []
      return [brickAcceptsFace(def) ? brick : { ...brick, paintId: DEFAULT_PAINT_ID }]
    })
  } catch {
    return []
  }
}

export function saveBuild(bricks: SavedBrick[]): void {
  try {
    const payload: SaveState = { version: 4, boardStuds: BASEPLATE_STUDS, bricks }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota or private mode — building still works.
  }
}