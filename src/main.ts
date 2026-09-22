import { unlockAudio } from './audio.ts'
import { BRICK_CATALOG } from './bricks/catalog.ts'
import { mountHud } from './ui/hud.ts'
import { createWorld } from './world.ts'
import './style.css'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')
const hudRoot = document.querySelector<HTMLElement>('#hud')
const fallback = document.querySelector<HTMLElement>('#webgl-fallback')

if (!canvas || !hudRoot) {
  throw new Error('Duplo Build markup is missing')
}

function webglOk(): boolean {
  try {
    const probe = document.createElement('canvas')
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'))
  } catch {
    return false
  }
}

if (!webglOk()) {
  fallback?.removeAttribute('hidden')
} else {
  const hud = {
    onChange: () => {},
    toast: (message: string) => {
      void message
    },
  }
  const world = createWorld(canvas, hud)
  const ui = mountHud(hudRoot, world)
  hud.onChange = ui.refresh
  hud.toast = ui.toast
  ui.refresh()

  const onFirst = () => unlockAudio()
  window.addEventListener('pointerdown', onFirst, { once: true })

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return
    const key = event.key.toLowerCase()
    if (world.isExploding()) {
      if (key === 'z' || key === 'x' || key === 'backspace' || key === 'delete') event.preventDefault()
      return
    }
    if (key === 'r') world.rotate()
    else if ((key === 'z' && (event.metaKey || event.ctrlKey)) || (key === 'z' && !event.metaKey && !event.ctrlKey)) {
      event.preventDefault()
      world.undo()
    } else if (key === 'x' || key === 'backspace' || key === 'delete') {
      event.preventDefault()
      world.setMode(world.getMode() === 'delete' ? 'place' : 'delete')
      ui.toast(world.getMode() === 'delete' ? 'Tap a brick to remove it' : 'Tap the board to build')
      ui.refresh()
    } else if (key === 'escape') {
      world.setMode('place')
      ui.refresh()
    } else if (key >= '1' && key <= '9') {
      const def = BRICK_CATALOG[Number(key) - 1]
      if (def) world.setKind(def.kind)
    } else if (key === '0') {
      const def = BRICK_CATALOG[9]
      if (def) world.setKind(def.kind)
    }
  })
}