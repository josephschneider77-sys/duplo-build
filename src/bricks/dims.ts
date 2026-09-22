/**
 * Duplo-compatible proportions (~2× System scale).
 * Design ids live in catalog comments. This toy is not affiliated with those brands.
 */
export const PITCH = 16
/** Body height of one brick, studs not included. */
export const BRICK_HEIGHT = 19.2
/**
 * Plates are half a brick, so two plates stack to one brick.
 * The old 6.4 value was a System plate (one third of a System brick).
 */
export const PLATE_HEIGHT = BRICK_HEIGHT / 2
/** Open stud outer radius. */
export const STUD_RADIUS = 4.8
/** Stud height kept near 4 so stacked bricks still hide the stud. */
export const STUD_HEIGHT = 4
export const BODY_GAP = 0.7
export const BASEPLATE_THICKNESS = 3.2
/** Was 12×12; 24×24 is ~4× the usable area at the same pitch. */
export const BASEPLATE_STUDS = 24

export function bodySize(studsX: number, studsZ: number): { w: number; d: number } {
  return {
    w: studsX * PITCH - BODY_GAP,
    d: studsZ * PITCH - BODY_GAP,
  }
}

export function cellCenter(sx: number, sz: number): { x: number; z: number } {
  return {
    x: (sx + 0.5) * PITCH,
    z: (sz + 0.5) * PITCH,
  }
}

export function boardOrigin(): number {
  return -Math.floor(BASEPLATE_STUDS / 2)
}

export function onBoard(sx: number, sz: number): boolean {
  const origin = boardOrigin()
  return sx >= origin && sz >= origin && sx < origin + BASEPLATE_STUDS && sz < origin + BASEPLATE_STUDS
}
