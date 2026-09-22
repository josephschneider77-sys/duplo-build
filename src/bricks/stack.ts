import { defFor, footprint, type BrickDef, type BrickKind } from './catalog.ts'

/** Tops within this distance are the same support. Duplo heights are exact; this is float slack. */
const EPS = 0.05

/**
 * What the top of one stud cell offers a brick above it.
 * `stud` is the click height, or null when the cell is covered by plastic with no stud
 * (the low end of a slope). `solid` is the highest plastic in the column.
 * A missing cell is the baseplate: a stud at y = 0 and no plastic above the board.
 */
export type Cover = { stud: number | null; solid: number }

export type StackPiece = {
  kind: BrickKind
  ox: number
  oz: number
  rot: number
  y: number
}

/**
 * Studs on the mesh before yaw. The slope's flat roof is the local −X row;
 * the toe is plastic only. Every other piece exposes its full footprint.
 */
export function hasLocalTopStud(def: BrickDef, ix: number, iz: number): boolean {
  if (ix < 0 || iz < 0 || ix >= def.studsX || iz >= def.studsZ) return false
  if (def.shape === 'slope') return ix === 0
  return true
}

/** Footprint cell (i, j) → stud index on the unrotated mesh. Matches poseMesh's yaw. */
export function localStud(studsX: number, studsZ: number, rot: number, i: number, j: number): { ix: number; iz: number } {
  const r = ((rot % 4) + 4) % 4
  if (r === 0) return { ix: i, iz: j }
  if (r === 1) return { ix: studsX - 1 - j, iz: i }
  if (r === 2) return { ix: studsX - 1 - i, iz: studsZ - 1 - j }
  return { ix: j, iz: studsZ - 1 - i }
}

function cellKey(sx: number, sz: number): string {
  return `${sx},${sz}`
}

/** Stud-grid origin so the piece's center sits on the pointer. Integer cells, so studs line up. */
export function footprintOrigin(x: number, z: number, w: number, d: number, pitch: number): { ox: number; oz: number } {
  return {
    ox: Math.round(x / pitch - w / 2),
    oz: Math.round(z / pitch - d / 2),
  }
}

/**
 * Highest plastic in each stud cell, and the stud you can still click.
 * A later, lower piece does not uncover a stud a taller piece already covered.
 */
export function rebuildCovers(pieces: readonly StackPiece[]): Map<string, Cover> {
  const covers = new Map<string, Cover>()
  for (const piece of pieces) {
    const def = defFor(piece.kind)
    const { w, d } = footprint(def.studsX, def.studsZ, piece.rot)
    const top = piece.y + def.height
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < d; j++) {
        const key = cellKey(piece.ox + i, piece.oz + j)
        const prev = covers.get(key)
        if (prev && top < prev.solid - EPS) continue
        const { ix, iz } = localStud(def.studsX, def.studsZ, piece.rot, i, j)
        const stud = hasLocalTopStud(def, ix, iz)
        covers.set(key, { stud: stud ? top : null, solid: Math.max(prev?.solid ?? 0, top) })
      }
    }
  }
  return covers
}

export type SeatLimits = { maxStack: number; unitHeight: number }

/**
 * Duplo click rule: the piece sits on the highest stud under its footprint.
 * One engaged stud is enough — the rest may overhang or bridge a gap.
 * Lower studs are not a second seat; the brick stays level.
 * Reject when no stud meets the underside, or when plastic already rises through that seat.
 */
export function seatOnCovers(
  covers: ReadonlyMap<string, Cover>,
  ox: number,
  oz: number,
  w: number,
  d: number,
  onBoardCell: (sx: number, sz: number) => boolean,
  limits: SeatLimits,
): { ok: boolean; y: number } {
  let seat: number | null = null
  let onBoardCount = 0
  const under: Cover[] = []
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      const sx = ox + i
      const sz = oz + j
      if (!onBoardCell(sx, sz)) continue
      onBoardCount += 1
      const cover = covers.get(cellKey(sx, sz)) ?? { stud: 0, solid: 0 }
      under.push(cover)
      if (cover.stud !== null && (seat === null || cover.stud > seat)) seat = cover.stud
    }
  }
  if (onBoardCount === 0 || seat === null) return { ok: false, y: 0 }
  let engaged = 0
  for (const cover of under) {
    if (cover.solid > seat + EPS) return { ok: false, y: seat }
    if (cover.stud !== null && Math.abs(cover.stud - seat) <= EPS) engaged += 1
  }
  if (engaged < 1) return { ok: false, y: seat }
  if (seat / limits.unitHeight >= limits.maxStack) return { ok: false, y: seat }
  return { ok: true, y: seat }
}
