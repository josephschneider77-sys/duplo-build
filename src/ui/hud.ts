import { BRICK_CATALOG, brickAcceptsFace, defFor, type BrickKind } from '../bricks/catalog.ts'
import { BRICK_COLORS } from '../bricks/colors.ts'
import { FACE_SKIP_TIP, PAINTS, drawFace } from '../bricks/paints.ts'
import type { WorldApi } from '../world.ts'

const MENU_COLS = 4

export function mountHud(root: HTMLElement, world: WorldApi): { refresh: () => void; toast: (msg: string) => void } {
  const toastEl = root.querySelector<HTMLElement>('[data-toast]')
  const countEl = root.querySelector<HTMLElement>('[data-count]')
  const modeBtn = root.querySelector<HTMLButtonElement>('[data-action="delete"]')
  const undoBtn = root.querySelector<HTMLButtonElement>('[data-action="undo"]')
  const picker = root.querySelector<HTMLElement>('[data-brick-picker]')
  const trigger = root.querySelector<HTMLButtonElement>('[data-brick-trigger]')
  const menu = root.querySelector<HTMLElement>('[data-brick-menu]')
  const currentShape = root.querySelector<HTMLElement>('[data-current-shape]')
  const currentLabel = root.querySelector<HTMLElement>('[data-current-label]')
  let toastTimer = 0
  let clearArmed = false

  const brickBox = root.querySelector('[data-bricks]')
  if (brickBox && brickBox.childElementCount === 0) {
    for (const def of BRICK_CATALOG) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'brick-btn'
      btn.dataset.kind = def.kind
      btn.title = def.hint
      btn.setAttribute('role', 'option')
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

  const paintBox = root.querySelector('[data-paints]')
  if (paintBox && paintBox.childElementCount === 0) {
    for (const paint of PAINTS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'face-chip'
      btn.dataset.paint = paint.id
      btn.title = paint.label
      btn.setAttribute('aria-label', paint.label)
      if (paint.id === 'none') {
        const label = document.createElement('span')
        label.className = 'face-chip-label'
        label.textContent = paint.label
        btn.append(label)
      } else {
        const thumb = document.createElement('canvas')
        thumb.width = 128
        thumb.height = 128
        thumb.className = 'face-thumb'
        thumb.setAttribute('aria-hidden', 'true')
        const ctx = thumb.getContext('2d')
        if (ctx) drawFace(ctx, paint.id, thumb.width)
        btn.append(thumb)
      }
      paintBox.append(btn)
    }
  }

  function brickButtons(): HTMLButtonElement[] {
    return [...root.querySelectorAll<HTMLButtonElement>('[data-bricks] [data-kind]')]
  }

  function isPickerOpen(): boolean {
    return picker?.dataset.open === 'true'
  }

  function setPickerOpen(open: boolean, restoreFocus = false): void {
    if (!picker || !trigger || !menu) return
    picker.dataset.open = String(open)
    trigger.setAttribute('aria-expanded', String(open))
    menu.hidden = !open
    if (open) {
      const selected =
        brickButtons().find((btn) => btn.getAttribute('aria-selected') === 'true') ?? brickButtons()[0]
      selected?.focus()
    } else if (restoreFocus) {
      trigger.focus()
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
    const paintId = world.getPaintId()
    const mode = world.getMode()
    const def = defFor(kind)
    root.dataset.mode = mode
    root.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((btn) => {
      const selected = btn.dataset.kind === kind
      btn.setAttribute('aria-pressed', String(selected))
      btn.setAttribute('aria-selected', String(selected))
    })
    root.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.color === colorId))
    })
    const facesOn = brickAcceptsFace(def)
    root.querySelectorAll<HTMLButtonElement>('[data-paint]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(facesOn && btn.dataset.paint === paintId))
    })
    const paintTip = root.querySelector<HTMLElement>('[data-paint-tip]')
    if (paintTip) paintTip.hidden = facesOn
    if (currentShape) currentShape.dataset.shape = kind
    if (currentLabel) currentLabel.textContent = def.label
    if (trigger) {
      trigger.setAttribute('aria-label', `${def.label}, ${def.hint}. Choose a brick`)
      trigger.title = `${def.label} — ${def.hint}`
    }
    if (modeBtn) {
      modeBtn.setAttribute('aria-pressed', String(mode === 'delete'))
      modeBtn.textContent = mode === 'delete' ? 'Placing' : 'Delete'
    }
    const locked = world.isExploding()
    root
      .querySelectorAll<HTMLButtonElement>(
        '[data-action="rotate"], [data-action="delete"], [data-action="clear"], [data-brick-trigger], [data-color], [data-kind]',
      )
      .forEach((btn) => {
        btn.disabled = locked
      })
    root.querySelectorAll<HTMLButtonElement>('[data-paint]').forEach((btn) => {
      btn.disabled = locked || !facesOn
      const name = btn.getAttribute('aria-label') ?? 'Face'
      btn.title = facesOn ? name : FACE_SKIP_TIP
    })
    if (undoBtn) undoBtn.disabled = locked || !world.canUndo()
    const clearBtn = root.querySelector<HTMLButtonElement>('[data-action="clear"]')
    if (clearBtn) clearBtn.setAttribute('aria-busy', String(locked))
    if (locked) setPickerOpen(false)
    if (countEl) {
      if (locked) countEl.textContent = 'Popping…'
      else {
        const n = world.brickCount()
        countEl.textContent = n === 0 ? 'Empty board' : n === 1 ? '1 brick' : `${n} bricks`
      }
    }
    const shadowLocked = world.isShadowLocked()
    root.dataset.shadow = mode === 'delete' ? 'off' : shadowLocked ? 'locked' : 'follow'
    const placeHint = root.querySelector<HTMLElement>('[data-place-hint]')
    if (placeHint) {
      if (locked) placeHint.textContent = ''
      else if (mode === 'delete') placeHint.textContent = ' · Tap a brick to remove it'
      else if (shadowLocked) placeHint.textContent = ' · Drag to move · tap to place · tap elsewhere to jump lock'
      else placeHint.textContent = ' · Shadow follows you → tap to lock → tap again to place'
    }
  }

  root.addEventListener('click', (event) => {
    if (world.isExploding()) return
    const raw = event.target as HTMLElement
    if (raw.closest('[data-brick-trigger]')) {
      setPickerOpen(!isPickerOpen(), false)
      return
    }
    const target = raw.closest<HTMLElement>('[data-kind], [data-color], [data-paint], [data-action]')
    if (!target) return
    if (target.dataset.kind) {
      world.setKind(target.dataset.kind as BrickKind)
      if (world.getMode() === 'delete') world.setMode('place')
      clearArmed = false
      setPickerOpen(false, true)
    } else if (target.dataset.color) {
      world.setColor(target.dataset.color)
      if (world.getMode() === 'delete') world.setMode('place')
      clearArmed = false
    } else if (target.dataset.paint) {
      if (!brickAcceptsFace(defFor(world.getKind()))) return
      world.setPaint(target.dataset.paint)
      if (world.getMode() === 'delete') world.setMode('place')
      clearArmed = false
    } else if (target.dataset.action === 'rotate') {
      world.rotate()
    } else if (target.dataset.action === 'delete') {
      world.setMode(world.getMode() === 'delete' ? 'place' : 'delete')
      toast(world.getMode() === 'delete' ? 'Tap a brick to remove it' : 'Tap to lock the shadow, tap again to place')
      clearArmed = false
    } else if (target.dataset.action === 'undo') {
      world.undo()
      clearArmed = false
    } else if (target.dataset.action === 'clear') {
      world.cancelLock()
      if (!clearArmed) {
        clearArmed = true
        toast('Tap Clear again to wipe the board')
        return
      }
      clearArmed = false
      world.clear()
    }
  })

  document.addEventListener('pointerdown', (event) => {
    if (!isPickerOpen() || !picker) return
    const target = event.target as Node | null
    if (target && picker.contains(target)) return
    setPickerOpen(false)
  })

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !isPickerOpen()) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setPickerOpen(false, true)
    },
    true,
  )

  trigger?.addEventListener('keydown', (event) => {
    if (isPickerOpen()) return
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    setPickerOpen(true)
  })

  menu?.addEventListener('keydown', (event) => {
    if (!isPickerOpen()) return
    const options = brickButtons()
    const current = document.activeElement
    const index = options.findIndex((btn) => btn === current)
    if (index < 0) return
    let next = -1
    if (event.key === 'ArrowRight') next = Math.min(options.length - 1, index + 1)
    else if (event.key === 'ArrowLeft') next = Math.max(0, index - 1)
    else if (event.key === 'ArrowDown') next = Math.min(options.length - 1, index + MENU_COLS)
    else if (event.key === 'ArrowUp') next = Math.max(0, index - MENU_COLS)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = options.length - 1
    if (next < 0 || next === index) return
    event.preventDefault()
    options[next]?.focus()
  })

  refresh()
  return { refresh, toast }
}
