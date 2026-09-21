import { BRICK_CATALOG, type BrickKind } from '../bricks/catalog.ts'
import { BRICK_COLORS } from '../bricks/colors.ts'
import type { WorldApi } from '../world.ts'

export function mountHud(root: HTMLElement, world: WorldApi): { refresh: () => void; toast: (msg: string) => void } {
  const toastEl = root.querySelector<HTMLElement>('[data-toast]')
  const countEl = root.querySelector<HTMLElement>('[data-count]')
  const modeBtn = root.querySelector<HTMLButtonElement>('[data-action="delete"]')
  const undoBtn = root.querySelector<HTMLButtonElement>('[data-action="undo"]')
  let toastTimer = 0
  let clearArmed = false

  const brickBox = root.querySelector('[data-bricks]')
  if (brickBox && brickBox.childElementCount === 0) {
    for (const def of BRICK_CATALOG) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'brick-btn'
      btn.dataset.kind = def.kind
      btn.setAttribute('aria-label', `${def.label} ${def.hint}`)
      btn.innerHTML = `
        <span class="mini" data-shape="${def.kind}" aria-hidden="true"></span>
        <span class="brick-label">${def.label}</span>
      `
      brickBox.append(btn)
    }
  }

  const colorBox = root.querySelector('[data-colors]')
  if (colorBox && colorBox.childElementCount === 0) {
    for (const color of BRICK_COLORS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'swatch'
      btn.dataset.color = color.id
      btn.title = color.name
      btn.setAttribute('aria-label', color.name)
      btn.style.setProperty('--swatch', `#${color.hex.toString(16).padStart(6, '0')}`)
      colorBox.append(btn)
    }
  }

  function toast(message: string): void {
    if (!toastEl) return
    toastEl.textContent = message
    toastEl.dataset.show = 'true'
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      toastEl.dataset.show = 'false'
    }, 1800)
  }

  function refresh(): void {
    const kind = world.getKind()
    const colorId = world.getColorId()
    const mode = world.getMode()
    root.dataset.mode = mode
    root.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.kind === kind))
    })
    root.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.color === colorId))
    })
    if (modeBtn) {
      modeBtn.setAttribute('aria-pressed', String(mode === 'delete'))
      modeBtn.textContent = mode === 'delete' ? 'Placing' : 'Delete'
    }
    if (undoBtn) undoBtn.disabled = !world.canUndo()
    if (countEl) {
      const n = world.brickCount()
      countEl.textContent = n === 0 ? 'Empty board' : n === 1 ? '1 brick' : `${n} bricks`
    }
  }

  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-kind], [data-color], [data-action]')
    if (!target) return
    if (target.dataset.kind) {
      world.setKind(target.dataset.kind as BrickKind)
      if (world.getMode() === 'delete') world.setMode('place')
      clearArmed = false
    } else if (target.dataset.color) {
      world.setColor(target.dataset.color)
      if (world.getMode() === 'delete') world.setMode('place')
      clearArmed = false
    } else if (target.dataset.action === 'rotate') {
      world.rotate()
    } else if (target.dataset.action === 'delete') {
      world.setMode(world.getMode() === 'delete' ? 'place' : 'delete')
      toast(world.getMode() === 'delete' ? 'Tap a brick to remove it' : 'Tap the board to build')
      clearArmed = false
    } else if (target.dataset.action === 'undo') {
      world.undo()
      clearArmed = false
    } else if (target.dataset.action === 'clear') {
      if (!clearArmed) {
        clearArmed = true
        toast('Tap Clear again to wipe the board')
        return
      }
      clearArmed = false
      world.clear()
    }
  })

  refresh()
  return { refresh, toast }
}