import { BrickKind, defFor } from './catalog.ts'
import { BASEPLATE_STUDS, BRICK_HEIGHT, PITCH, PLATE_HEIGHT, boardOrigin, onBoard } from './dims.ts'
import { footprintOrigin, hasLocalTopStud, localStud, rebuildCovers, seatOnCovers, type Cover, type StackPiece } from './stack.ts'

const limits = { maxStack: 24, unitHeight: BRICK_HEIGHT }
const slopeH = defFor(BrickKind.Slope2x2).height
const archH = defFor(BrickKind.Arch2x4).height

function seat(covers: ReadonlyMap<string, Cover>, ox: number, oz: number, w: number, d: number) {
  return seatOnCovers(covers, ox, oz, w, d, onBoard, limits)
}

function pieces(...items: StackPiece[]): Map<string, Cover> {
  return rebuildCovers(items)
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.05
}

// 2×2 fully on the corner of a 2×8, and again hanging off that corner by one stud.
{
  const covers = pieces({ kind: BrickKind.Brick2x8, ox: 0, oz: 0, rot: 0, y: 0 })
  const corner = seat(covers, 0, 0, 2, 2)
  assert(corner.ok && near(corner.y, BRICK_HEIGHT), `2×2 on 2×8 corner: ${JSON.stringify(corner)}`)
  const end = seat(covers, 6, 0, 2, 2)
  assert(end.ok && near(end.y, BRICK_HEIGHT), `2×2 on far end of 2×8: ${JSON.stringify(end)}`)
  const hang = seat(covers, 7, 0, 2, 2)
  assert(hang.ok && near(hang.y, BRICK_HEIGHT), `2×2 overhanging the end stud: ${JSON.stringify(hang)}`)
}

// 2×4 half on a 2×2: two studs click, two hang over the baseplate.
{
  const covers = pieces({ kind: BrickKind.Brick2x2, ox: 0, oz: 0, rot: 0, y: 0 })
  const half = seat(covers, 0, 0, 4, 2)
  assert(half.ok && near(half.y, BRICK_HEIGHT), `2×4 half-on 2×2: ${JSON.stringify(half)}`)
}

// 2×4 bridging two 2×2s, one stud column on each, gap in the middle.
{
  const covers = pieces(
    { kind: BrickKind.Brick2x2, ox: 0, oz: 0, rot: 0, y: 0 },
    { kind: BrickKind.Brick2x2, ox: 3, oz: 0, rot: 0, y: 0 },
  )
  const bridge = seat(covers, 1, 0, 4, 2)
  assert(bridge.ok && near(bridge.y, BRICK_HEIGHT), `2×4 straddling two 2×2s: ${JSON.stringify(bridge)}`)
}

// Different heights: sit on the taller stud and leave a gap over the plate.
{
  const covers = pieces(
    { kind: BrickKind.Brick2x2, ox: 0, oz: 0, rot: 0, y: 0 },
    { kind: BrickKind.Plate2x2, ox: 2, oz: 0, rot: 0, y: 0 },
  )
  const span = seat(covers, 0, 0, 4, 2)
  assert(span.ok && near(span.y, BRICK_HEIGHT), `span brick and plate: ${JSON.stringify(span)}`)
}

// 1×2 anywhere on a 4×4 plate, including the corner, not only the center.
{
  const covers = pieces({ kind: BrickKind.Plate4x4, ox: 0, oz: 0, rot: 0, y: 0 })
  const corner = seat(covers, 0, 0, 2, 1)
  assert(corner.ok && near(corner.y, PLATE_HEIGHT), `1×2 on 4×4 corner: ${JSON.stringify(corner)}`)
  const edge = seat(covers, 2, 3, 2, 1)
  assert(edge.ok && near(edge.y, PLATE_HEIGHT), `1×2 on 4×4 edge: ${JSON.stringify(edge)}`)
}

// Slope roof studs accept a brick. The toe does not. A brick on the studs may overhang the toe.
{
  const covers = pieces({ kind: BrickKind.Slope2x2, ox: 0, oz: 0, rot: 0, y: 0 })
  const toe = covers.get('1,0')
  const roof = covers.get('0,0')
  assert(toe?.stud === null && roof?.stud != null && near(roof.stud, slopeH), `slope stud mask ${JSON.stringify({ toe, roof })}`)
  const onRoof = seat(covers, 0, 0, 1, 2)
  assert(onRoof.ok && near(onRoof.y, slopeH), `1×2 on slope roof: ${JSON.stringify(onRoof)}`)
  const onToe = seat(covers, 1, 0, 1, 2)
  assert(!onToe.ok, `1×2 on slope toe should float: ${JSON.stringify(onToe)}`)
  const overBoth = seat(covers, 0, 0, 2, 2)
  assert(overBoth.ok && near(overBoth.y, slopeH), `2×2 on slope studs overhanging the toe: ${JSON.stringify(overBoth)}`)
  const turned = pieces({ kind: BrickKind.Slope2x2, ox: 0, oz: 0, rot: 1, y: 0 })
  assert(turned.get('0,1')?.stud != null && turned.get('0,0')?.stud === null, 'rotated slope studs follow the roof')
}

// Arch top studs are real studs across the whole footprint.
{
  const covers = pieces({ kind: BrickKind.Arch2x4, ox: 0, oz: 0, rot: 0, y: 0 })
  const onArch = seat(covers, 2, 0, 2, 2)
  assert(onArch.ok && near(onArch.y, archH), `2×2 on arch: ${JSON.stringify(onArch)}`)
  assert(covers.get('0,0')?.stud != null && covers.get('3,1')?.stud != null, 'arch exposes every top stud')
}

// Plastic through the seat is illegal: slope toe is taller than the plate beside it.
{
  const covers = pieces(
    { kind: BrickKind.Slope2x2, ox: 0, oz: 0, rot: 0, y: 0 },
    { kind: BrickKind.Plate2x2, ox: 2, oz: 0, rot: 0, y: 0 },
  )
  const clip = seat(covers, 1, 0, 2, 2)
  assert(!clip.ok, `piece clipping the slope toe: ${JSON.stringify(clip)}`)
}

// Nothing under the piece but open air (off the board).
{
  const floating = seat(new Map(), 100, 100, 2, 2)
  assert(!floating.ok, `off-board float: ${JSON.stringify(floating)}`)
}

// One baseplate stud at the rim is enough; the rest may hang off the board.
{
  const rimX = boardOrigin() + BASEPLATE_STUDS - 1
  const rim = seat(new Map(), rimX, 0, 2, 2)
  assert(rim.ok && near(rim.y, 0), `one stud on the rim: ${JSON.stringify(rim)}`)
  const past = seat(new Map(), rimX + 1, 0, 2, 2)
  assert(!past.ok, `fully past the rim: ${JSON.stringify(past)}`)
}

// The plate grew from a centered 24×24. Those cells stay on the board.
{
  assert(BASEPLATE_STUDS === 28 && boardOrigin() === -14, `plate ${BASEPLATE_STUDS} origin ${boardOrigin()}`)
  assert(onBoard(-12, -12) && onBoard(11, 11), 'legacy 24×24 corner cells stay on the plate')
  assert(!onBoard(-15, 0) && !onBoard(14, 0), 'cells outside 28×28 are off the plate')
}

// Direct cover rule: highest stud wins, a taller non-stud solid rejects.
{
  const covers = new Map<string, Cover>([
    ['0,0', { stud: BRICK_HEIGHT * 2, solid: BRICK_HEIGHT * 2 }],
    ['1,0', { stud: BRICK_HEIGHT, solid: BRICK_HEIGHT }],
  ])
  const high = seat(covers, 0, 0, 2, 1)
  assert(high.ok && near(high.y, BRICK_HEIGHT * 2), `highest stud with a gap: ${JSON.stringify(high)}`)
  const blocked = new Map<string, Cover>([
    ['0,0', { stud: BRICK_HEIGHT, solid: BRICK_HEIGHT }],
    ['1,0', { stud: null, solid: BRICK_HEIGHT * 2 }],
  ])
  const hit = seat(blocked, 0, 0, 2, 1)
  assert(!hit.ok, `solid through the seat: ${JSON.stringify(hit)}`)
}

// Stack cap still applies to the seat, not to the lower gap.
{
  const covers = new Map<string, Cover>([['0,0', { stud: BRICK_HEIGHT * 24, solid: BRICK_HEIGHT * 24 }]])
  const capped = seat(covers, 0, 0, 1, 1)
  assert(!capped.ok, `max stack: ${JSON.stringify(capped)}`)
}

// local stud index matches the four yaws of a 2×2 slope roof (ix === 0).
{
  const def = defFor(BrickKind.Slope2x2)
  for (let rot = 0; rot < 4; rot++) {
    let studs = 0
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const { ix, iz } = localStud(2, 2, rot, i, j)
        if (hasLocalTopStud(def, ix, iz)) studs += 1
      }
    }
    assert(studs === 2, `rot ${rot} should expose 2 roof studs, got ${studs}`)
  }
}

// A click on the corner stud of a 2×8 (cell 0) keeps a 2×2 on that corner, not the brick's middle.
{
  const corner = footprintOrigin(0.5 * PITCH, 0.5 * PITCH, 2, 2, PITCH)
  assert(corner.ox === 0 && corner.oz === 0, `corner stud origin ${JSON.stringify(corner)}`)
  const middle = footprintOrigin(4 * PITCH, 1 * PITCH, 2, 2, PITCH)
  assert(middle.ox === 3 && middle.oz === 0, `middle of 2×8 origin ${JSON.stringify(middle)}`)
}

console.log('stack checks ok')
