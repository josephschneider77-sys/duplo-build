import { BRICK_HEIGHT, PLATE_HEIGHT } from './dims.ts'

export const BrickKind = {
  Brick2x2: 'brick2x2',
  Brick2x3: 'brick2x3',
  Brick2x4: 'brick2x4',
  Brick2x6: 'brick2x6',
  Brick2x8: 'brick2x8',
  Brick1x1: 'brick1x1',
  Brick1x2: 'brick1x2',
  Brick1x4: 'brick1x4',
  Plate1x2: 'plate1x2',
  Plate2x2: 'plate2x2',
  Plate2x4: 'plate2x4',
  Plate4x4: 'plate4x4',
  Plate4x8: 'plate4x8',
  Arch2x4: 'arch2x4',
  Slope2x3: 'slope2x3',
  Round2x2: 'round2x2',
} as const

export type BrickKind = (typeof BrickKind)[keyof typeof BrickKind]

/** Visual body. Footprint and stack height stay rectangular for snap rules. */
export type BrickShape = 'rect' | 'arch' | 'slope' | 'round'

export type BrickDef = {
  kind: BrickKind
  label: string
  hint: string
  studsX: number
  studsZ: number
  height: number
  shape: BrickShape
}

export const BRICK_CATALOG: BrickDef[] = [
  {
    kind: BrickKind.Brick2x2,
    label: '2×2',
    hint: 'Square brick',
    studsX: 2,
    studsZ: 2,
    height: BRICK_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Brick2x3,
    label: '2×3',
    hint: 'Medium brick',
    studsX: 3,
    studsZ: 2,
    height: BRICK_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Brick2x4,
    label: '2×4',
    hint: 'Long brick',
    studsX: 4,
    studsZ: 2,
    height: BRICK_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Brick2x6,
    label: '2×6',
    hint: 'Longer brick',
    studsX: 6,
    studsZ: 2,
    height: BRICK_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Brick2x8,
    label: '2×8',
    hint: 'Longest brick',
    studsX: 8,
    studsZ: 2,
    height: BRICK_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Brick1x1,
    label: '1×1',
    hint: 'Tiny brick',
    studsX: 1,
    studsZ: 1,
    height: BRICK_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Brick1x2,
    label: '1×2',
    hint: 'Skinny brick',
    studsX: 2,
    studsZ: 1,
    height: BRICK_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Brick1x4,
    label: '1×4',
    hint: 'Skinny long brick',
    studsX: 4,
    studsZ: 1,
    height: BRICK_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Plate1x2,
    label: '1×2 plate',
    hint: 'Tiny flat',
    studsX: 2,
    studsZ: 1,
    height: PLATE_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Plate2x2,
    label: '2×2 plate',
    hint: 'Square plate',
    studsX: 2,
    studsZ: 2,
    height: PLATE_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Plate2x4,
    label: '2×4 plate',
    hint: 'Long plate',
    studsX: 4,
    studsZ: 2,
    height: PLATE_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Plate4x4,
    label: '4×4 plate',
    hint: 'Flat plate',
    studsX: 4,
    studsZ: 4,
    height: PLATE_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Plate4x8,
    label: '4×8 plate',
    hint: 'Big flat',
    studsX: 8,
    studsZ: 4,
    height: PLATE_HEIGHT,
    shape: 'rect',
  },
  {
    kind: BrickKind.Arch2x4,
    label: '2×4 arch',
    hint: 'Bridge with a tunnel',
    studsX: 4,
    studsZ: 2,
    height: BRICK_HEIGHT,
    shape: 'arch',
  },
  {
    kind: BrickKind.Slope2x3,
    label: '2×3 slope',
    hint: 'Ramp brick',
    studsX: 3,
    studsZ: 2,
    height: BRICK_HEIGHT,
    shape: 'slope',
  },
  {
    kind: BrickKind.Round2x2,
    label: '2×2 round',
    hint: 'Cylinder brick',
    studsX: 2,
    studsZ: 2,
    height: BRICK_HEIGHT,
    shape: 'round',
  },
]

export function defFor(kind: BrickKind): BrickDef {
  const found = BRICK_CATALOG.find((d) => d.kind === kind)
  if (!found) throw new Error(`Unknown brick kind: ${kind}`)
  return found
}

export function footprint(studsX: number, studsZ: number, rot: number): { w: number; d: number } {
  return rot % 2 === 0 ? { w: studsX, d: studsZ } : { w: studsZ, d: studsX }
}
