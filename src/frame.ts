/** Phone and short-window breakpoints. Keep these in sync with style.css. */
export const COMPACT_MAX_WIDTH = 780
export const COMPACT_MAX_HEIGHT = 520

/**
 * Fraction of the free viewport the baseplate should fill vertically.
 * Leaves a margin so the near edge stays above the panel.
 */
export const BOARD_FILL = 0.82

export type Insets = { top: number; right: number; bottom: number; left: number }

export type Box = { top: number; right: number; bottom: number; left: number; width: number; height: number }

export type ScreenBox = { minX: number; maxX: number; minY: number; maxY: number }

export function useCompactFraming(width: number, height: number): boolean {
  return width <= COMPACT_MAX_WIDTH || height <= COMPACT_MAX_HEIGHT
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * How much of the viewport the top bar and dock cover.
 * A tall dock on the right is a side panel. A wide dock along the bottom is the phone tray.
 */
export function hudInsets(viewport: { width: number; height: number }, topbar: Box | null, dock: Box | null): Insets {
  const { width, height } = viewport
  const insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
  if (topbar && topbar.bottom > topbar.top && topbar.top < height * 0.45 && topbar.right - topbar.left > 40) {
    insets.top = clamp(topbar.bottom, 0, height - 1)
  }
  if (!dock) return insets
  const dockW = dock.right - dock.left
  const dockH = dock.bottom - dock.top
  const sideRight = dock.left > width * 0.4 && dock.right >= width - 28 && dockH > height * 0.4
  const sideLeft = dock.right < width * 0.6 && dock.left <= 28 && dockH > height * 0.4
  const bottom = dock.top > height * 0.3 && dock.bottom >= height - 28 && dockW > width * 0.45
  if (sideRight) insets.right = clamp(width - dock.left, 0, width - 1)
  else if (sideLeft) insets.left = clamp(dock.right, 0, width - 1)
  else if (bottom) insets.bottom = clamp(height - dock.top, 0, height - 1)
  return insets
}

export function freeRect(
  width: number,
  height: number,
  insets: Insets,
): { x: number; y: number; width: number; height: number } {
  const x = clamp(insets.left, 0, Math.max(0, width - 1))
  const y = clamp(insets.top, 0, Math.max(0, height - 1))
  const right = clamp(insets.right, 0, Math.max(0, width - x - 1))
  const bottom = clamp(insets.bottom, 0, Math.max(0, height - y - 1))
  return {
    x,
    y,
    width: Math.max(1, width - x - right),
    height: Math.max(1, height - y - bottom),
  }
}

/**
 * One framing correction.
 *
 * `PerspectiveCamera.setViewOffset` shifts the picture in CSS pixels:
 * increasing offsetY moves the subject up, increasing offsetX moves it left.
 * Distance scales with on-screen size, so a subject taller than the free
 * area moves the camera back.
 */
export function framingStep(input: {
  offsetX: number
  offsetY: number
  distance: number
  subject: ScreenBox
  viewport: { width: number; height: number }
  insets: Insets
  fill?: number
}): { offsetX: number; offsetY: number; distance: number } {
  const fill = input.fill ?? BOARD_FILL
  const free = freeRect(input.viewport.width, input.viewport.height, input.insets)
  const cx = (input.subject.minX + input.subject.maxX) / 2
  const cy = (input.subject.minY + input.subject.maxY) / 2
  const subjectH = Math.max(1, input.subject.maxY - input.subject.minY)
  const targetH = Math.max(1, free.height * fill)
  return {
    offsetX: input.offsetX + (cx - (free.x + free.width / 2)),
    offsetY: input.offsetY + (cy - (free.y + free.height / 2)),
    distance: input.distance * (subjectH / targetH),
  }
}
