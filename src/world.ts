import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { playBurst, playPop } from './audio.ts'
import { BrickKind, defFor, footprint, type BrickDef } from './bricks/catalog.ts'
import { colorById, DEFAULT_COLOR_ID } from './bricks/colors.ts'
import { PITCH, onBoard } from './bricks/dims.ts'
import { createBaseplate, createBrickGroup, disableRaycast, tagBrick } from './bricks/geometry.ts'
import { createBurst, type Burst } from './fx/burst.ts'
import { loadBuild, saveBuild, type SavedBrick } from './persist.ts'

export type ToolMode = 'place' | 'delete'

export type WorldApi = {
  setKind: (kind: BrickKind) => void
  setColor: (colorId: string) => void
  rotate: () => void
  setMode: (mode: ToolMode) => void
  undo: () => void
  clear: () => void
  isExploding: () => boolean
  getKind: () => BrickKind
  getColorId: () => string
  getMode: () => ToolMode
  canUndo: () => boolean
  brickCount: () => number
  dispose: () => void
}

type Placed = SavedBrick & { mesh: THREE.Group }

type Action =
  | { type: 'place'; brick: SavedBrick }
  | { type: 'delete'; brick: SavedBrick }
  | { type: 'clear'; bricks: SavedBrick[] }

type HudBridge = {
  onChange: () => void
  toast: (message: string) => void
}

const TAP_PX = 10
const MAX_STACK = 24

export function createWorld(canvas: HTMLCanvasElement, hud: HudBridge): WorldApi {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor(0xd9c4ff, 1)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0xd9c4ff, 720, 1680)
  scene.background = new THREE.Color(0xd9c4ff)

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2800)
  camera.position.set(280, 300, 340)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 8, 0)
  controls.minDistance = 80
  controls.maxDistance = 820
  controls.minPolarAngle = 0.18
  controls.maxPolarAngle = Math.PI / 2 - 0.04
  controls.screenSpacePanning = false
  controls.zoomToCursor = false
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  }
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  }

  const BASE_CAM_DIST = camera.position.distanceTo(controls.target)
  const BASE_TARGET_Y = 8
  const BASE_MAX_DIST = 820
  let userDriving = false
  let userPinnedCloser = false
  let autoDistance = BASE_CAM_DIST
  let lastSeenTop = 0
  controls.addEventListener('start', () => {
    userDriving = true
  })
  controls.addEventListener('end', () => {
    userDriving = false
    const { distance: needed } = neededFraming(tallestTop())
    const dist = camera.position.distanceTo(controls.target)
    userPinnedCloser = dist < needed - 8
  })

  scene.add(new THREE.HemisphereLight(0xffe6f7, 0x8ec5ff, 1.05))

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.35)
  sun.position.set(200, 360, 140)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 20
  sun.shadow.camera.far = 900
  sun.shadow.camera.left = -320
  sun.shadow.camera.right = 320
  sun.shadow.camera.top = 320
  sun.shadow.camera.bottom = -320
  scene.add(sun)
  scene.add(new THREE.DirectionalLight(0xff9ad5, 0.35).translateX(-140).translateY(80).translateZ(-70))

  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(480, 480, 6, 64),
    new THREE.MeshStandardMaterial({ color: 0xfce7f3, roughness: 0.85 }),
  )
  table.position.y = -7.6
  table.receiveShadow = true
  scene.add(table)

  const baseplate = createBaseplate()
  scene.add(baseplate)

  const raycaster = new THREE.Raycaster()
  const pointerNdc = new THREE.Vector2()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  let kind: BrickKind = BrickKind.Brick2x2
  let colorId = DEFAULT_COLOR_ID
  let rot = 0
  let mode: ToolMode = 'place'
  const bricks: Placed[] = []
  const undoStack: Action[] = []
  const heights = new Map<string, number>()

  let ghost: THREE.Group | null = null
  let ghostValid = false
  let ghostPose: { ox: number; oz: number; y: number } | null = null
  let hoverId: string | null = null
  let raf = 0
  let disposed = false
  let exploding = false
  let burst: Burst | null = null
  let clearSnapshot: SavedBrick[] | null = null
  let lastTick = 0

  const pointerDown = { x: 0, y: 0, active: false, pointerId: -1 }

  function cellKey(sx: number, sz: number): string {
    return `${sx},${sz}`
  }

  function rebuildHeights(): void {
    heights.clear()
    for (const b of bricks) {
      const def = defFor(b.kind)
      const { w, d } = footprint(def.studsX, def.studsZ, b.rot)
      const top = b.y + def.height
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < d; j++) {
          const k = cellKey(b.ox + i, b.oz + j)
          heights.set(k, Math.max(heights.get(k) ?? 0, top))
        }
      }
    }
  }

  /** Duplo-style: ≥1 stud can click. Same-height supports; gaps/overhangs are fine. */
  function support(ox: number, oz: number, w: number, d: number): { ok: boolean; y: number } {
    let supportY: number | null = null
    let onBoardCount = 0
    let baseCount = 0
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < d; j++) {
        const sx = ox + i
        const sz = oz + j
        if (!onBoard(sx, sz)) continue
        onBoardCount += 1
        const h = heights.get(cellKey(sx, sz)) ?? 0
        if (h > 0.05) {
          if (supportY === null) supportY = h
          else if (Math.abs(h - supportY) > 0.05) return { ok: false, y: supportY }
        } else {
          baseCount += 1
        }
      }
    }
    if (onBoardCount === 0) return { ok: false, y: 0 }
    const y = supportY ?? 0
    if (supportY === null && baseCount === 0) return { ok: false, y: 0 }
    const stack = y / defFor(BrickKind.Brick2x2).height
    if (stack >= MAX_STACK) return { ok: false, y }
    return { ok: true, y }
  }

  function toSaved(b: Placed): SavedBrick {
    return { id: b.id, kind: b.kind, colorId: b.colorId, ox: b.ox, oz: b.oz, rot: b.rot, y: b.y }
  }

  function persist(): void {
    saveBuild(bricks.map(toSaved))
    hud.onChange()
  }

  function poseMesh(mesh: THREE.Group, def: BrickDef, ox: number, oz: number, y: number, rotation: number): void {
    const { w, d } = footprint(def.studsX, def.studsZ, rotation)
    mesh.position.set((ox + w / 2) * PITCH, y, (oz + d / 2) * PITCH)
    mesh.rotation.set(0, rotation * (Math.PI / 2), 0)
  }

  function addPlaced(data: SavedBrick, recordUndo: boolean): void {
    const def = defFor(data.kind)
    const mesh = createBrickGroup(def, colorById(data.colorId).hex)
    tagBrick(mesh, data.id)
    poseMesh(mesh, def, data.ox, data.oz, data.y, data.rot)
    scene.add(mesh)
    bricks.push({ ...data, mesh })
    if (recordUndo) undoStack.push({ type: 'place', brick: { ...data } })
    rebuildHeights()
  }

  function releaseBrick(mesh: THREE.Object3D): void {
    const seen = new Set<THREE.Material>()
    mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of mats) {
        if (seen.has(mat)) continue
        seen.add(mat)
        mat.dispose()
      }
    })
  }

  function removeById(id: string, recordUndo: boolean): boolean {
    const idx = bricks.findIndex((b) => b.id === id)
    if (idx < 0) return false
    const [removed] = bricks.splice(idx, 1)
    scene.remove(removed.mesh)
    if (recordUndo) undoStack.push({ type: 'delete', brick: toSaved(removed) })
    rebuildHeights()
    return true
  }

  function rebuildGhost(): void {
    if (ghost) scene.remove(ghost)
    ghost = null
    ghostValid = true
    if (mode !== 'place') return
    const def = defFor(kind)
    ghost = createBrickGroup(def, colorById(colorId).hex, { ghost: true, valid: true })
    disableRaycast(ghost)
    ghost.visible = false
    scene.add(ghost)
  }

  function setGhostValid(valid: boolean): void {
    if (!ghost || ghostValid === valid) return
    ghostValid = valid
    const hex = colorById(colorId).hex
    ghost.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        obj.material.color.setHex(valid ? hex : 0xff4d6d)
        obj.material.opacity = valid ? 0.52 : 0.4
      }
    })
  }

  function pickFromEvent(event: PointerEvent): THREE.Intersection[] {
    const rect = canvas.getBoundingClientRect()
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointerNdc, camera)
    return raycaster.intersectObjects(scene.children, true)
  }

  function updateGhost(event: PointerEvent): void {
    if (mode !== 'place' || !ghost) {
      if (ghost) ghost.visible = false
      ghostPose = null
      return
    }

    const hits = pickFromEvent(event).filter((h) => {
      const obj = h.object
      return obj.userData.baseplate || obj.userData.brickId
    })

    // Aim with the ground plane so one screen point always maps to the same
    // cells (a brick-top hit is closer to the camera and would shift x/z).
    const point = new THREE.Vector3()
    if (!raycaster.ray.intersectPlane(groundPlane, point)) {
      ghost.visible = false
      ghostPose = null
      return
    }

    const def = defFor(kind)
    const { w, d } = footprint(def.studsX, def.studsZ, rot)
    let ox = Math.round(point.x / PITCH - w / 2)
    let oz = Math.round(point.z / PITCH - d / 2)

    const hitId = hits[0]?.object.userData.brickId as string | undefined
    const hitBrick = hitId ? bricks.find((b) => b.id === hitId) : undefined
    if (hitBrick) {
      const hitDef = defFor(hitBrick.kind)
      const hitFp = footprint(hitDef.studsX, hitDef.studsZ, hitBrick.rot)
      if (w <= hitFp.w && d <= hitFp.d) {
        ox = hitBrick.ox + Math.floor((hitFp.w - w) / 2)
        oz = hitBrick.oz + Math.floor((hitFp.d - d) / 2)
      }
    }

    const seat = support(ox, oz, w, d)
    poseMesh(ghost, def, ox, oz, seat.y, rot)
    ghost.visible = true
    setGhostValid(seat.ok)
    ghostPose = seat.ok ? { ox, oz, y: seat.y } : null
  }

  function highlight(id: string | null): void {
    if (hoverId === id) return
    for (const b of bricks) {
      b.mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          obj.material.emissive.setHex(b.id === id ? 0xffffff : 0x000000)
          obj.material.emissiveIntensity = b.id === id ? 0.22 : 0
        }
      })
    }
    hoverId = id
  }

  function placeAtGhost(): boolean {
    if (!ghostPose) {
      hud.toast('Need a stud to click onto')
      playPop(false)
      return false
    }
    const data: SavedBrick = {
      id: crypto.randomUUID(),
      kind,
      colorId,
      ox: ghostPose.ox,
      oz: ghostPose.oz,
      rot,
      y: ghostPose.y,
    }
    addPlaced(data, true)
    persist()
    playPop(true)
    return true
  }

  function deleteAt(event: PointerEvent): boolean {
    const hit = pickFromEvent(event).find((h) => h.object.userData.brickId)
    const id = hit?.object.userData.brickId as string | undefined
    if (!id) {
      hud.toast('Tap a brick to toss it')
      return false
    }
    if (!removeById(id, true)) return false
    highlight(null)
    persist()
    playPop(true)
    return true
  }

  function onPointerDown(event: PointerEvent): void {
    if (exploding) return
    if (event.target !== canvas) return
    pointerDown.active = true
    pointerDown.x = event.clientX
    pointerDown.y = event.clientY
    pointerDown.pointerId = event.pointerId
  }

  function onPointerMove(event: PointerEvent): void {
    if (exploding) return
    if (event.target !== canvas) {
      if (ghost) ghost.visible = false
      highlight(null)
      return
    }
    if (mode === 'delete') {
      const hit = pickFromEvent(event).find((h) => h.object.userData.brickId)
      highlight((hit?.object.userData.brickId as string | undefined) ?? null)
      return
    }
    updateGhost(event)
  }

  function onPointerUp(event: PointerEvent): void {
    if (exploding) {
      pointerDown.active = false
      return
    }
    if (!pointerDown.active || pointerDown.pointerId !== event.pointerId) return
    pointerDown.active = false
    if (event.target !== canvas) return
    const dx = event.clientX - pointerDown.x
    const dy = event.clientY - pointerDown.y
    if (dx * dx + dy * dy > TAP_PX * TAP_PX) return
    if (event.button !== 0 && event.pointerType === 'mouse') return
    if (mode === 'delete') deleteAt(event)
    else {
      updateGhost(event)
      placeAtGhost()
      updateGhost(event)
    }
  }

  function onPointerLeave(): void {
    if (ghost) ghost.visible = false
    highlight(null)
  }

  function tallestTop(): number {
    let top = 0
    for (const b of bricks) {
      top = Math.max(top, b.y + defFor(b.kind).height)
    }
    return top
  }

  function neededFraming(top: number): { distance: number; targetY: number } {
    const portrait = window.innerHeight > window.innerWidth
    const rise = Math.max(0, top)
    return {
      distance: Math.min(2200, BASE_CAM_DIST + rise * (portrait ? 2.05 : 1.7)),
      targetY: BASE_TARGET_Y + rise * (portrait ? 0.5 : 0.38),
    }
  }

  function setOrbitDistance(next: number): void {
    const offset = camera.position.clone().sub(controls.target)
    if (offset.lengthSq() < 1e-6) offset.set(0.2, 0.4, 1)
    offset.setLength(Math.max(controls.minDistance, Math.min(controls.maxDistance, next)))
    camera.position.copy(controls.target).add(offset)
  }

  function easeFraming(): void {
    const top = tallestTop()
    const { distance: needed, targetY } = neededFraming(top)
    controls.maxDistance = Math.max(BASE_MAX_DIST, needed + 120)

    if (userDriving) {
      lastSeenTop = top
      return
    }

    const grew = top > lastSeenTop + 0.05
    lastSeenTop = top
    if (grew && camera.position.distanceTo(controls.target) < needed - 1.5) {
      userPinnedCloser = false
    }

    const ty = controls.target.y
    const nextY = ty + (targetY - ty) * 0.05
    if (Math.abs(nextY - ty) > 0.02) {
      camera.position.y += nextY - ty
      controls.target.y = nextY
    }

    const dist = camera.position.distanceTo(controls.target)
    if (!userPinnedCloser && dist < needed - 1.5) {
      const next = dist + (needed - dist) * 0.07
      setOrbitDistance(next)
      autoDistance = next
    } else if (!userPinnedCloser && dist > needed + 45 && Math.abs(dist - autoDistance) < 18) {
      const next = dist + (needed - dist) * 0.035
      setOrbitDistance(next)
      autoDistance = next
    }
  }

  function onResize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  }

  function finishBurst(): void {
    if (!burst && !exploding) return
    burst?.dispose()
    if (burst) scene.remove(burst.group)
    burst = null
    for (const b of bricks) {
      scene.remove(b.mesh)
      releaseBrick(b.mesh)
    }
    bricks.length = 0
    const snapshot = clearSnapshot ?? []
    clearSnapshot = null
    undoStack.push({ type: 'clear', bricks: snapshot })
    rebuildHeights()
    exploding = false
    ghostPose = null
    persist()
    hud.toast('All cleared — undo if that was a whoops')
  }

  function tick(): void {
    if (disposed) return
    const now = performance.now()
    const dt = lastTick === 0 ? 0.016 : Math.min(0.05, (now - lastTick) / 1000)
    lastTick = now
    if (burst && !burst.update(dt)) finishBurst()
    easeFraming()
    controls.update()
    renderer.render(scene, camera)
    raf = requestAnimationFrame(tick)
  }

  rebuildGhost()

  for (const saved of loadBuild()) addPlaced(saved, false)
  persist()

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  window.addEventListener('resize', onResize)
  raf = requestAnimationFrame(tick)

  return {
    setKind(next) {
      if (exploding) return
      kind = next
      rebuildGhost()
      hud.onChange()
    },
    setColor(next) {
      if (exploding) return
      colorId = next
      rebuildGhost()
      hud.onChange()
    },
    rotate() {
      if (exploding) return
      rot = (rot + 1) % 4
      hud.toast(rot % 2 === 0 ? 'Straight' : 'Turned')
      hud.onChange()
    },
    setMode(next) {
      if (exploding) return
      mode = next
      highlight(null)
      rebuildGhost()
      hud.onChange()
    },
    undo() {
      if (exploding) return
      const action = undoStack.pop()
      if (!action) {
        hud.toast('Nothing to undo')
        return
      }
      if (action.type === 'place') removeById(action.brick.id, false)
      else if (action.type === 'delete') addPlaced(action.brick, false)
      else {
        for (const b of [...bricks]) removeById(b.id, false)
        for (const b of action.bricks) addPlaced(b, false)
      }
      persist()
      playPop(true)
    },
    clear() {
      if (exploding) return
      if (bricks.length === 0) {
        hud.toast('Board is already empty')
        return
      }
      // Keep the build in memory (and localStorage) until the pop finishes,
      // then commit the same clear + undo snapshot Clear used to do at once.
      exploding = true
      pointerDown.active = false
      highlight(null)
      ghostPose = null
      if (ghost) ghost.visible = false
      clearSnapshot = bricks.map(toSaved)
      for (const b of bricks) scene.remove(b.mesh)
      try {
        burst = createBurst(
          bricks.map((b) => ({
            kind: b.kind,
            hex: colorById(b.colorId).hex,
            ox: b.ox,
            oz: b.oz,
            rot: b.rot,
            y: b.y,
          })),
        )
        scene.add(burst.group)
      } catch (err) {
        console.error(err)
        finishBurst()
        return
      }
      playBurst()
      hud.toast('Pop! Bricks go flying')
      hud.onChange()
    },
    isExploding: () => exploding,
    getKind: () => kind,
    getColorId: () => colorId,
    getMode: () => mode,
    canUndo: () => undoStack.length > 0,
    brickCount: () => bricks.length,
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      burst?.dispose()
      burst = null
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
    },
  }
}
