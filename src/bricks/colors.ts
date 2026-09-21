export type BrickColor = {
  id: string
  name: string
  hex: number
}

export const BRICK_COLORS: BrickColor[] = [
  { id: 'cherry', name: 'Cherry', hex: 0xe63946 },
  { id: 'sunshine', name: 'Sunshine', hex: 0xffd23f },
  { id: 'sky', name: 'Sky', hex: 0x4cc9f0 },
  { id: 'grass', name: 'Grass', hex: 0x6fde6f },
  { id: 'grape', name: 'Grape', hex: 0x9b5de5 },
  { id: 'bubblegum', name: 'Bubblegum', hex: 0xff6bcb },
  { id: 'tangerine', name: 'Tangerine', hex: 0xff9f1c },
  { id: 'mint', name: 'Mint', hex: 0x7ef0d2 },
]

export const DEFAULT_COLOR_ID = 'grape'

export function colorById(id: string): BrickColor {
  return BRICK_COLORS.find((c) => c.id === id) ?? BRICK_COLORS[0]
}