import { BRICK_HEIGHT, PLATE_HEIGHT } from './dims.ts'

export const BrickKind = {
  Brick2x2: 'brick2x2',
  Brick2x4: 'brick2x4',
  Brick1x2: 'brick1x2',
  Plate4x4: 'plate4x4',
} as const

export type BrickKind = (typeof BrickKind)[keyof typeof BrickKind]

export type BrickDef = {
  kind: BrickKind
  label: string
  hint: string
  studsX: number
  studsZ: number
  height: number
}

export const BRICK_CATALOG: BrickDef[] = [
  {
    kind: BrickKind.Brick2x2,
    label: '2×2',
    hint: 'Square brick',
    studsX: 2,
    studsZ: 2,
    height: BRICK_HEIGHT,
  },
  {
    kind: BrickKind.Brick2x4,
    label: '2×4',
    hint: 'Long brick',
    studsX: 4,
    studsZ: 2,
    height: BRICK_HEIGHT,
  },
  {
    kind: BrickKind.Brick1x2,
    label: '1×2',
    hint: 'Skinny brick',
    studsX: 2,
    studsZ: 1,
    height: BRICK_HEIGHT,
  },
  {
    kind: BrickKind.Plate4x4,
    label: '4×4 plate',
    hint: 'Flat plate',
    studsX: 4,
    studsZ: 4,
    height: PLATE_HEIGHT,
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