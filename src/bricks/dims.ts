/** Duplo-compatible proportions (~2× System / LEGO scale). */
export const PITCH = 16
export const BRICK_HEIGHT = 19.2
export const PLATE_HEIGHT = 6.4
export const STUD_RADIUS = 4.8
export const STUD_HEIGHT = 4.0
export const BODY_GAP = 0.7
export const BASEPLATE_THICKNESS = 3.2
export const BASEPLATE_STUDS = 12

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
  const o = boardOrigin()
  return sx >= o && sz >= o && sx < o + BASEPLATE_STUDS && sz < o + BASEPLATE_STUDS
}