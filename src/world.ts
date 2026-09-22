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
  cancelLock: () => void
  isExploding: () => boolean
  isShadowLocked: () => boolean
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
/** Movement past this, after a press on a locked shadow, slides it instead of placing. */
const DRAG_PX = 12
/** Extra screen padding so a finger just beside the shadow can still grab it. */
const NEAR_PX = 28
const MAX_STACK = 24

type SnapCell = { ox: number; oz: number; y: number; ok: boolean }

type PlaceDecision =
  | { type: 'lock'; ox: number; oz: number; y: number }
  | { type: 'place' }
  | { type: 'move'; ox: number; oz: number; y: number }
  | { type: 'reject' }

/**
 * Two-tap place: the first valid tap locks the shadow, a later tap on that
 * shadow commits it, and a tap on a different valid cell moves the lock.
 */
function resolvePlaceTap(opts: {
  locked: boolean
  lockValid: boolean
  sameCell: boolean
  onShadow: boolean
  snap: SnapCell | null
}): PlaceDecision {
  const { locked, lockValid, sameCell, onShadow, snap } = opts
  if (!locked) {
    if (snap?.ok) return { type: 'lock', ox: snap.ox, oz: snap.oz, y: snap.y }
    return { type: 'reject' }
  }
  const confirm = (sameCell || onShadow) && lockValid && !(sameCell && snap && !snap.ok)
  if (confirm) return { type: 'place' }
  if (snap?.ok) return { type: 'move', ox: snap.ox, oz: snap.oz, y: snap.y }
  return { type: 'reject' }
}

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
  const groundPoint = new THREE.Vector3()
  const lockedBox = new THREE.Box3()
  const lockedHit = new THREE.Vector3()
  const screenCorner = new THREE.Vector3()

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
  let shadowLocked = false
  /** Stud origin of a locked shadow. Kept even when that seat turns invalid. */
  let lockedCell: { ox: number; oz: number } | null = null
  /** Press began on or near the locked shadow, so this gesture slides it instead of orbiting. */
  let dragCandidate = false
  let draggingLock = false
  /** Last valid cell visited while sliding. Invalid releases fall back here. */
  let dragSeat: { ox: number; oz: number; y: number } | null = null
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

  function ghostMaterial(): THREE.MeshStandardMaterial | null {
    let mat: THREE.MeshStandardMaterial | null = null
    ghost?.traverse((obj) => {
      if (mat) return
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) mat = obj.material
    })
    return mat
  }

  function paintGhost(valid: boolean): void {
    if (!ghost) return
    ghostValid = valid
    const mat = ghostMaterial()
    if (!mat) return
    const hex = colorById(colorId).hex
    if (!valid) {
      mat.color.setHex(0xff4d6d)
      mat.opacity = 0.48
      mat.emissive.setHex(0x4a0010)
      mat.emissiveIntensity = 0.18
      return
    }
    mat.color.setHex(hex)
    if (shadowLocked) {
      mat.opacity = 0.8
      mat.emissive.setHex(0xffffff)
      mat.emissiveIntensity = 0.28
    } else {
      mat.opacity = 0.64
      mat.emissive.setHex(0x000000)
      mat.emissiveIntensity = 0
    }
  }

  function pulseLockedGhost(): void {
    if (!shadowLocked || !ghostValid || !ghost?.visible) return
    const mat = ghostMaterial()
    if (!mat) return
    const wave = 0.5 + 0.5 * Math.sin(performance.now() / 220)
    mat.opacity = 0.64 + wave * 0.24
    mat.emissiveIntensity = 0.1 + wave * 0.34
  }

  function showGhostAt(ox: number, oz: number, y: number, valid: boolean): void {
    if (!ghost) return
    poseMesh(ghost, defFor(kind), ox, oz, y, rot)
    ghost.visible = true
    paintGhost(valid)
    ghostPose = valid ? { ox, oz, y } : null
  }

  function seatLocked(): { ox: number; oz: number; y: number; ok: boolean } | null {
    if (!lockedCell) return null
    const def = defFor(kind)
    const { w, d } = footprint(def.studsX, def.studsZ, rot)
    const seat = support(lockedCell.ox, lockedCell.oz, w, d)
    return { ox: lockedCell.ox, oz: lockedCell.oz, y: seat.y, ok: seat.ok }
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
    const seated = shadowLocked ? seatLocked() : null
    if (seated) showGhostAt(seated.ox, seated.oz, seated.y, seated.ok)
  }

  function pickFromEvent(event: PointerEvent): THREE.Intersection[] {
    const rect = canvas.getBoundingClientRect()
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointerNdc, camera)
    return raycaster.intersectObjects(scene.children, true)
  }

  function snapFromEvent(event: PointerEvent, assist = true): (SnapCell & { point: THREE.Vector3 }) | null {
    const hits = pickFromEvent(event).filter((h) => {
      const obj = h.object
      return obj.userData.baseplate || obj.userData.brickId
    })

    // Aim with the ground plane so one screen point always maps to the same
    // cells (a brick-top hit is closer to the camera and would shift x/z).
    if (!raycaster.ray.intersectPlane(groundPlane, groundPoint)) return null

    const def = defFor(kind)
    const { w, d } = footprint(def.studsX, def.studsZ, rot)
    let ox = Math.round(groundPoint.x / PITCH - w / 2)
    let oz = Math.round(groundPoint.z / PITCH - d / 2)

    const hitId = hits[0]?.object.userData.brickId as string | undefined
    const hitBrick = assist && hitId ? bricks.find((b) => b.id === hitId) : undefined
    if (hitBrick) {
      const hitDef = defFor(hitBrick.kind)
      const hitFp = footprint(hitDef.studsX, hitDef.studsZ, hitBrick.rot)
      if (w <= hitFp.w && d <= hitFp.d) {
        ox = hitBrick.ox + Math.floor((hitFp.w - w) / 2)
        oz = hitBrick.oz + Math.floor((hitFp.d - d) / 2)
      }
    }

    const seat = support(ox, oz, w, d)
    return { ox, oz, y: seat.y, ok: seat.ok, point: groundPoint }
  }

  function footprintHasPoint(point: THREE.Vector3 | null): boolean {
    if (!point || !lockedCell) return false
    const def = defFor(kind)
    const { w, d } = footprint(def.studsX, def.studsZ, rot)
    const sx = Math.floor(point.x / PITCH)
    const sz = Math.floor(point.z / PITCH)
    return sx >= lockedCell.ox && sx < lockedCell.ox + w && sz >= lockedCell.oz && sz < lockedCell.oz + d
  }

  /** True when the pointer ray meets the locked shadow before the ground. */
  function hitsLockedGhost(ground: THREE.Vector3 | null): boolean {
    if (!ghost || !shadowLocked) return false
    lockedBox.setFromObject(ghost)
    if (lockedBox.isEmpty()) return false
    if (!raycaster.ray.intersectBox(lockedBox, lockedHit)) return false
    if (!ground) return true
    const origin = raycaster.ray.origin
    return lockedHit.distanceToSquared(origin) <= ground.distanceToSquared(origin) + 4
  }

  function updateGhost(event: PointerEvent): void {
    if (mode !== 'place' || !ghost) {
      if (ghost) ghost.visible = false
      if (!shadowLocked) ghostPose = null
      return
    }
    if (shadowLocked) {
      ghost.visible = true
      return
    }
    const snap = snapFromEvent(event)
    if (!snap) {
      ghost.visible = false
      ghostPose = null
      return
    }
    showGhostAt(snap.ox, snap.oz, snap.y, snap.ok)
  }

  function lockShadow(ox: number, oz: number, y: number): void {
    shadowLocked = true
    lockedCell = { ox, oz }
    showGhostAt(ox, oz, y, true)
    hud.onChange()
  }

  function endDragGesture(): void {
    dragCandidate = false
    draggingLock = false
    controls.enabled = true
  }

  function releaseLock(): void {
    shadowLocked = false
    lockedCell = null
    dragSeat = null
    pointerDown.active = false
    endDragGesture()
  }

  function restoreLockedGhost(): void {
    const seated = seatLocked()
    if (seated) showGhostAt(seated.ox, seated.oz, seated.y, seated.ok)
  }

  function pointerNearLockedGhost(clientX: number, clientY: number): boolean {
    if (!ghost) return false
    lockedBox.setFromObject(ghost)
    if (lockedBox.isEmpty()) return false
    const rect = canvas.getBoundingClientRect()
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const xs = [lockedBox.min.x, lockedBox.max.x]
    const ys = [lockedBox.min.y, lockedBox.max.y]
    const zs = [lockedBox.min.z, lockedBox.max.z]
    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          screenCorner.set(x, y, z).project(camera)
          if (screenCorner.z > 1) continue
          const sx = (screenCorner.x * 0.5 + 0.5) * rect.width + rect.left
          const sy = (-screenCorner.y * 0.5 + 0.5) * rect.height + rect.top
          minX = Math.min(minX, sx)
          minY = Math.min(minY, sy)
          maxX = Math.max(maxX, sx)
          maxY = Math.max(maxY, sy)
        }
      }
    }
    if (!Number.isFinite(minX)) return false
    return (
      clientX >= minX - NEAR_PX &&
      clientX <= maxX + NEAR_PX &&
      clientY >= minY - NEAR_PX &&
      clientY <= maxY + NEAR_PX
    )
  }

  function pressOnLockedShadow(event: PointerEvent): boolean {
    if (!shadowLocked || !ghost) return false
    const snap = snapFromEvent(event)
    if (hitsLockedGhost(snap?.point ?? null) || footprintHasPoint(snap?.point ?? null)) return true
    return pointerNearLockedGhost(event.clientX, event.clientY)
  }

  function previewDrag(event: PointerEvent): void {
    const snap = snapFromEvent(event, false)
    if (!snap) return
    showGhostAt(snap.ox, snap.oz, snap.y, snap.ok)
    if (snap.ok) dragSeat = { ox: snap.ox, oz: snap.oz, y: snap.y }
  }

  function finishDrag(event: PointerEvent): void {
    const snap = snapFromEvent(event, false)
    const next = snap?.ok ? snap : dragSeat
    dragSeat = null
    if (next) {
      lockShadow(next.ox, next.oz, next.y)
      return
    }
    restoreLockedGhost()
  }

  function cancelLock(): void {
    if (exploding || !shadowLocked) return
    releaseLock()
    if (ghost) paintGhost(ghostValid)
    hud.onChange()
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
    releaseLock()
    addPlaced(data, true)
    persist()
    playPop(true)
    return true
  }

  function onPlaceTap(event: PointerEvent): void {
    const snap = snapFromEvent(event)
    if (!shadowLocked) {
      if (!snap) {
        if (ghost) ghost.visible = false
        ghostPose = null
      } else {
        showGhostAt(snap.ox, snap.oz, snap.y, snap.ok)
      }
    }

    const sameCell = !!snap && !!lockedCell && snap.ox === lockedCell.ox && snap.oz === lockedCell.oz
    const onShadow = shadowLocked && (footprintHasPoint(snap?.point ?? null) || hitsLockedGhost(snap?.point ?? null))
    const decision = resolvePlaceTap({
      locked: shadowLocked,
      lockValid: !!ghostPose,
      sameCell,
      onShadow,
      snap,
    })

    if (decision.type === 'lock' || decision.type === 'move') {
      lockShadow(decision.ox, decision.oz, decision.y)
      hud.toast(decision.type === 'lock' ? 'Shadow locked' : 'Shadow moved')
      return
    }
    if (decision.type === 'place') {
      if (placeAtGhost()) updateGhost(event)
      return
    }
    if (sameCell && snap && !snap.ok) {
      showGhostAt(snap.ox, snap.oz, snap.y, false)
      hud.toast('Need a stud to click onto')
      playPop(false)
      return
    }
    if (!shadowLocked || !ghostPose) {
      hud.toast('Need a stud to click onto')
      playPop(false)
      return
    }
    hud.toast('Tap the shadow to place')
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

  function onPointerDownCapture(event: PointerEvent): void {
    if (exploding || event.target !== canvas) return
    if (mode !== 'place' || !shadowLocked) return
    if (event.button !== 0 && event.pointerType === 'mouse') return
    if (!pressOnLockedShadow(event)) return
    dragCandidate = true
    draggingLock = false
    dragSeat = null
    controls.enabled = false
  }

  function onPointerDown(event: PointerEvent): void {
    if (exploding) return
    if (event.target !== canvas) return
    pointerDown.active = true
    pointerDown.x = event.clientX
    pointerDown.y = event.clientY
    pointerDown.pointerId = event.pointerId
    if (dragCandidate) canvas.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent): void {
    if (exploding) return
    if (dragCandidate && pointerDown.active && event.pointerId === pointerDown.pointerId) {
      const dx = event.clientX - pointerDown.x
      const dy = event.clientY - pointerDown.y
      if (!draggingLock && dx * dx + dy * dy > DRAG_PX * DRAG_PX) draggingLock = true
      if (draggingLock) previewDrag(event)
      return
    }
    if (event.target !== canvas) {
      if (ghost && !shadowLocked) ghost.visible = false
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
    if (!pointerDown.active || pointerDown.pointerId !== event.pointerId) return
    const dx = event.clientX - pointerDown.x
    const dy = event.clientY - pointerDown.y
    const moved = dx * dx + dy * dy
    const grabbed = dragCandidate
    const dragged = draggingLock || (grabbed && moved > DRAG_PX * DRAG_PX)
    pointerDown.active = false
    endDragGesture()
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (exploding) return
    if (event.button !== 0 && event.pointerType === 'mouse') return
    if (dragged) {
      finishDrag(event)
      return
    }
    if (!grabbed && event.target !== canvas) return
    if (!grabbed && moved > TAP_PX * TAP_PX) return
    if (mode === 'delete') deleteAt(event)
    else onPlaceTap(event)
  }

  function onPointerCancel(event: PointerEvent): void {
    if (!pointerDown.active || pointerDown.pointerId !== event.pointerId) return
    const dragged = draggingLock
    pointerDown.active = false
    dragSeat = null
    endDragGesture()
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (dragged && shadowLocked) restoreLockedGhost()
  }

  function onPointerLeave(): void {
    if (ghost && !shadowLocked) ghost.visible = false
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

    if (userDriving || draggingLock) {
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
    releaseLock()
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
    pulseLockedGhost()
    easeFraming()
    controls.update()
    renderer.render(scene, camera)
    raf = requestAnimationFrame(tick)
  }

  rebuildGhost()

  for (const saved of loadBuild()) addPlaced(saved, false)
  persist()

  canvas.addEventListener('pointerdown', onPointerDownCapture, true)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerCancel)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  window.addEventListener('resize', onResize)
  raf = requestAnimationFrame(tick)

  return {
    setKind(next) {
      if (exploding) return
      kind = next
      releaseLock()
      ghostPose = null
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
      const prev = rot
      rot = (rot + 1) % 4
      if (shadowLocked && lockedCell && ghost) {
        const def = defFor(kind)
        const oldFp = footprint(def.studsX, def.studsZ, prev)
        const nextFp = footprint(def.studsX, def.studsZ, rot)
        const cx = lockedCell.ox + oldFp.w / 2
        const cz = lockedCell.oz + oldFp.d / 2
        let ox = Math.round(cx - nextFp.w / 2)
        let oz = Math.round(cz - nextFp.d / 2)
        let seat = support(ox, oz, nextFp.w, nextFp.d)
        if (!seat.ok) {
          const kept = support(lockedCell.ox, lockedCell.oz, nextFp.w, nextFp.d)
          if (kept.ok) {
            ox = lockedCell.ox
            oz = lockedCell.oz
            seat = kept
          }
        }
        lockedCell = { ox, oz }
        showGhostAt(ox, oz, seat.y, seat.ok)
      }
      hud.toast(rot % 2 === 0 ? 'Straight' : 'Turned')
      hud.onChange()
    },
    setMode(next) {
      if (exploding) return
      mode = next
      highlight(null)
      releaseLock()
      ghostPose = null
      rebuildGhost()
      hud.onChange()
    },
    undo() {
      if (exploding) return
      releaseLock()
      ghostPose = null
      if (ghost) ghost.visible = false
      const action = undoStack.pop()
      if (!action) {
        hud.toast('Nothing to undo')
        hud.onChange()
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
      releaseLock()
      ghostPose = null
      if (ghost) ghost.visible = false
      if (bricks.length === 0) {
        hud.toast('Board is already empty')
        hud.onChange()
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
    isShadowLocked: () => shadowLocked,
    cancelLock,
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
      canvas.removeEventListener('pointerdown', onPointerDownCapture, true)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
    },
  }
}
