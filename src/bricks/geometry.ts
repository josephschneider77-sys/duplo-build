import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { BASEPLATE_STUDS, BASEPLATE_THICKNESS, BODY_GAP, BRICK_HEIGHT, PITCH, PLATE_HEIGHT, STUD_HEIGHT, STUD_RADIUS, bodySize, boardOrigin } from './dims.ts'
import type { BrickDef } from './catalog.ts'
import { faceCanvasTexture } from './paints.ts'

/** Inner wall of the open stud. The pin is a second cylinder, not a boolean cut. */
const STUD_INNER = 3.5
const STUD_PIN_RADIUS = 1.6
const CHAMFER = 0.55

const bodyGeos = new Map<string, THREE.BufferGeometry>()

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = bodyGeos.get(key)
  if (!geo) {
    geo = make()
    bodyGeos.set(key, geo)
  }
  return geo
}

function hollowStudGeometry(): THREE.BufferGeometry {
  return cached('stud-hollow', () => {
    const half = STUD_HEIGHT / 2
    // Outer tube. A lathe of two radii is the hollow cylinder; no CSG subtract.
    const tube = new THREE.LatheGeometry(
      [
        new THREE.Vector2(STUD_RADIUS, -half),
        new THREE.Vector2(STUD_RADIUS, half),
        new THREE.Vector2(STUD_INNER, half),
        new THREE.Vector2(STUD_INNER, -half),
      ],
      16,
    )
    const pinH = STUD_HEIGHT * 0.62
    const pin = new THREE.CylinderGeometry(STUD_PIN_RADIUS, STUD_PIN_RADIUS, pinH, 10)
    pin.translate(0, -half + pinH / 2 + 0.05, 0)
    const tubeOpen = tube.toNonIndexed()
    const pinOpen = pin.toNonIndexed()
    tube.dispose()
    pin.dispose()
    const merged = mergeGeometries([tubeOpen, pinOpen])
    tubeOpen.dispose()
    pinOpen.dispose()
    if (!merged) throw new Error('Could not build hollow stud')
    merged.computeVertexNormals()
    return merged
  })
}

const studGeometry = hollowStudGeometry()

function rectGeometry(def: BrickDef): THREE.BufferGeometry {
  return cached(`rect:${def.studsX}x${def.studsZ}x${def.height}`, () => {
    const { w, d } = bodySize(def.studsX, def.studsZ)
    const radius = Math.min(CHAMFER, w / 2 - 0.05, d / 2 - 0.05, def.height / 2 - 0.05)
    return new RoundedBoxGeometry(w, def.height, d, 2, Math.max(0.05, radius))
  })
}

/**
 * Design 11198 recipe A. Bottom at y = 0.
 * Outer rect with a tall elliptical hole (rx = 16, ry = 0.78 H), not a semicircle and not pillars plus a flat lintel.
 * Clockwise π→0 is the upper half. Flip that flag if the opening comes out inverted.
 */
function insideBowGeometry(def: BrickDef): THREE.BufferGeometry {
  return cached(`bow:${def.studsX}x${def.studsZ}x${def.height}`, () => {
    const W = 4 * PITCH - BODY_GAP
    const D = 2 * PITCH - BODY_GAP
    const H = def.height
    const rx = PITCH
    const ry = H * 0.78

    const shape = new THREE.Shape()
    shape.moveTo(-W / 2, 0)
    shape.lineTo(W / 2, 0)
    shape.lineTo(W / 2, H)
    shape.lineTo(-W / 2, H)
    shape.closePath()

    const hole = new THREE.Path()
    hole.absellipse(0, 0, rx, ry, Math.PI, 0, true)
    hole.closePath()
    shape.holes.push(hole)

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: D,
      bevelEnabled: true,
      bevelThickness: 0.35,
      bevelSize: 0.35,
      curveSegments: 24,
      steps: 1,
    })
    geo.translate(0, 0, -D / 2)
    geo.computeVertexNormals()
    return geo
  })
}

/**
 * Design 6474 — 2×2×1½ slope. Bottom at y = 0, high end at −X.
 * Flat roof is one stud wide. The slope runs the other stud, from a plate-height
 * toe up to 1½ bricks. Angle is atan((H − tipH) / slopeRun), about 50° (LDraw).
 * Two studs sit on the flat roof because catalog height is H.
 */
function slopeGeometry(def: BrickDef): THREE.BufferGeometry {
  return cached(`slope:${def.kind}:${def.height}`, () => {
    const W = 2 * PITCH - BODY_GAP
    const D = 2 * PITCH - BODY_GAP
    const H = 1.5 * BRICK_HEIGHT
    const tipH = PLATE_HEIGHT
    const flatW = PITCH - BODY_GAP / 2

    const shape = new THREE.Shape()
    shape.moveTo(-W / 2, 0)
    shape.lineTo(W / 2, 0)
    shape.lineTo(W / 2, tipH)
    shape.lineTo(-W / 2 + flatW, H)
    shape.lineTo(-W / 2, H)
    shape.closePath()

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: D,
      bevelEnabled: true,
      bevelThickness: 0.35,
      bevelSize: 0.35,
      curveSegments: 1,
      steps: 1,
    })
    geo.translate(0, 0, -D / 2)
    geo.computeVertexNormals()
    return geo
  })
}

function roundGeometry(def: BrickDef): THREE.BufferGeometry {
  return cached(`round:${def.studsX}x${def.studsZ}x${def.height}`, () => {
    const { w, d } = bodySize(def.studsX, def.studsZ)
    const radius = Math.min(w, d) / 2
    return new THREE.CylinderGeometry(radius, radius, def.height, 40)
  })
}

function shade(mesh: THREE.Mesh, ghost?: boolean): void {
  mesh.castShadow = !ghost
  mesh.receiveShadow = !ghost
}

function addStuds(
  group: THREE.Group,
  def: BrickDef,
  mat: THREE.Material,
  ghost: boolean | undefined,
  keep?: (ix: number, iz: number) => boolean,
): void {
  const studY = def.height + STUD_HEIGHT / 2
  for (let ix = 0; ix < def.studsX; ix++) {
    for (let iz = 0; iz < def.studsZ; iz++) {
      if (keep && !keep(ix, iz)) continue
      const stud = new THREE.Mesh(studGeometry, mat)
      stud.position.set(
        (ix + 0.5) * PITCH - (def.studsX * PITCH) / 2,
        studY,
        (iz + 0.5) * PITCH - (def.studsZ * PITCH) / 2,
      )
      shade(stud, ghost)
      group.add(stud)
    }
  }
}

function addRectBody(group: THREE.Group, def: BrickDef, mat: THREE.Material, ghost?: boolean): void {
  const body = new THREE.Mesh(rectGeometry(def), mat)
  body.position.y = def.height / 2
  shade(body, ghost)
  group.add(body)
}

function addArchBody(group: THREE.Group, def: BrickDef, mat: THREE.Material, ghost?: boolean): void {
  const body = new THREE.Mesh(insideBowGeometry(def), mat)
  shade(body, ghost)
  group.add(body)
}

function addSlopeBody(group: THREE.Group, def: BrickDef, mat: THREE.Material, ghost?: boolean): void {
  const body = new THREE.Mesh(slopeGeometry(def), mat)
  shade(body, ghost)
  group.add(body)
}

function addRoundBody(group: THREE.Group, def: BrickDef, mat: THREE.Material, ghost?: boolean): void {
  const body = new THREE.Mesh(roundGeometry(def), mat)
  body.position.y = def.height / 2
  shade(body, ghost)
  group.add(body)
}

export function plasticMaterial(hex: number, opts?: { ghost?: boolean; valid?: boolean }): THREE.MeshStandardMaterial {
  const ghost = opts?.ghost ?? false
  const valid = opts?.valid ?? true
  const color = ghost && !valid ? 0xff4d6d : hex
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.38,
    metalness: 0.04,
    emissive: ghost && !valid ? 0x4a0010 : 0x000000,
    emissiveIntensity: ghost && !valid ? 0.15 : 0,
    transparent: ghost,
    opacity: ghost ? (valid ? 0.52 : 0.4) : 1,
    depthWrite: !ghost,
  })
}

export function createBrickGroup(
  def: BrickDef,
  hex: number,
  opts?: { ghost?: boolean; valid?: boolean; paintId?: string },
): THREE.Group {
  const group = new THREE.Group()
  group.name = def.kind
  const mat = plasticMaterial(hex, opts)
  const { w, d } = bodySize(def.studsX, def.studsZ)
  const ghost = opts?.ghost

  if (def.shape === 'arch') addArchBody(group, def, mat, ghost)
  else if (def.shape === 'slope') addSlopeBody(group, def, mat, ghost)
  else if (def.shape === 'round') addRoundBody(group, def, mat, ghost)
  else addRectBody(group, def, mat, ghost)

  if (def.shape === 'slope') {
    // Studs stay on the flat high end (local -X, the first stud row).
    addStuds(group, def, mat, ghost, (ix) => ix === 0)
  } else {
    addStuds(group, def, mat, ghost)
  }

  attachFace(group, def, opts?.paintId, ghost)

  // Keep a slightly larger pick volume than the visual gap.
  group.userData.pickSize = { w, d, h: def.height }
  return group
}

/** Sticker sits just proud of the plastic so it does not z-fight the bevel. */
const STICKER_GAP = 0.28
/** Extruded arch and slope bevels swell past the outline. Clear that lip. */
const BEVEL_CLEAR = 0.85

/**
 * ~70% of the face, centered. Aspect is capped so a long brick keeps one
 * readable face in the middle instead of stretching eyes into a stripe.
 */
function facePanel(faceW: number, faceH: number): { w: number; h: number } {
  let w = faceW * 0.7
  let h = faceH * 0.7
  const cap = 1.55
  if (w > h * cap) w = h * cap
  if (h > w * cap) h = w * cap
  return { w, h }
}

function stickerPlane(w: number, h: number): THREE.BufferGeometry {
  return cached(`sticker:${w.toFixed(2)}x${h.toFixed(2)}`, () => new THREE.PlaneGeometry(w, h))
}

function stickerMaterial(texture: THREE.CanvasTexture, ghost?: boolean): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: ghost ? 0.92 : 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    premultipliedAlpha: false,
  })
}

/**
 * Rect and round: local +Z is the front, so Rotate carries the print.
 * Slope: the tall vertical back (local −X). Arch: the solid +X end,
 * the largest face without the doorway.
 */
function attachFace(group: THREE.Group, def: BrickDef, paintId: string | undefined, ghost?: boolean): void {
  if (!paintId || paintId === 'none') return
  const texture = faceCanvasTexture(paintId)
  if (!texture) return
  const mat = stickerMaterial(texture, ghost)
  const mesh = new THREE.Mesh(faceGeometry(def), mat)
  poseFace(mesh, def)
  mesh.name = 'face'
  mesh.userData.faceDecal = true
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.renderOrder = 2
  group.add(mesh)
  group.userData.faceMaterial = mat
  group.userData.paintId = paintId
}

function faceGeometry(def: BrickDef): THREE.BufferGeometry {
  if (def.shape === 'round') {
    const { w, d } = bodySize(def.studsX, def.studsZ)
    const radius = Math.min(w, d) / 2
    const panel = facePanel(radius * 2, def.height)
    const shellR = radius + 0.45
    // Wide enough that the default three-quarter camera still sees the front print.
    const theta = Math.min(Math.PI * 0.85, Math.max(panel.w / shellR, Math.PI * 0.75))
    return cached(
      `sticker-arc:${shellR.toFixed(2)}:${panel.h.toFixed(2)}:${theta.toFixed(3)}`,
      () => new THREE.CylinderGeometry(shellR, shellR, panel.h, 24, 1, true, -theta / 2, theta),
    )
  }
  const panel = facePanelFor(def)
  return stickerPlane(panel.w, panel.h)
}

function facePanelFor(def: BrickDef): { w: number; h: number } {
  if (def.shape === 'slope') {
    const depth = 2 * PITCH - BODY_GAP
    return facePanel(depth, def.height)
  }
  if (def.shape === 'arch') {
    const depth = 2 * PITCH - BODY_GAP
    return facePanel(depth, def.height)
  }
  const { w } = bodySize(def.studsX, def.studsZ)
  return facePanel(w, def.height)
}

function poseFace(mesh: THREE.Mesh, def: BrickDef): void {
  if (def.shape === 'round') {
    mesh.position.y = def.height / 2
    return
  }
  if (def.shape === 'slope') {
    const width = 2 * PITCH - BODY_GAP
    mesh.position.set(-width / 2 - BEVEL_CLEAR, def.height / 2, 0)
    mesh.rotation.y = -Math.PI / 2
    return
  }
  if (def.shape === 'arch') {
    const width = 4 * PITCH - BODY_GAP
    mesh.position.set(width / 2 + BEVEL_CLEAR, def.height / 2, 0)
    mesh.rotation.y = Math.PI / 2
    return
  }
  const { d } = bodySize(def.studsX, def.studsZ)
  mesh.position.set(0, def.height / 2, d / 2 + STICKER_GAP)
}

export function createBaseplate(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'baseplate'
  const origin = boardOrigin()
  const size = BASEPLATE_STUDS * PITCH
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x6ad38a,
    roughness: 0.55,
    metalness: 0.02,
  })
  const studMat = new THREE.MeshStandardMaterial({
    color: 0x57c278,
    roughness: 0.45,
    metalness: 0.03,
  })

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(size + 4, BASEPLATE_THICKNESS, size + 4),
    bodyMat,
  )
  body.position.y = -BASEPLATE_THICKNESS / 2
  body.receiveShadow = true
  body.userData.baseplate = true
  group.add(body)

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(size + 8, 1.4, size + 8),
    new THREE.MeshStandardMaterial({ color: 0xff8ac9, roughness: 0.5 }),
  )
  rim.position.y = -BASEPLATE_THICKNESS - 0.6
  rim.receiveShadow = true
  group.add(rim)

  const count = BASEPLATE_STUDS * BASEPLATE_STUDS
  const studs = new THREE.InstancedMesh(studGeometry, studMat, count)
  const dummy = new THREE.Object3D()
  let i = 0
  for (let ix = 0; ix < BASEPLATE_STUDS; ix++) {
    for (let iz = 0; iz < BASEPLATE_STUDS; iz++) {
      const sx = origin + ix
      const sz = origin + iz
      dummy.position.set((sx + 0.5) * PITCH, STUD_HEIGHT / 2, (sz + 0.5) * PITCH)
      dummy.updateMatrix()
      studs.setMatrixAt(i, dummy.matrix)
      i += 1
    }
  }
  studs.instanceMatrix.needsUpdate = true
  studs.receiveShadow = true
  studs.userData.baseplate = true
  group.add(studs)

  group.userData.baseplate = true
  return group
}

export function disableRaycast(root: THREE.Object3D): void {
  root.traverse((obj) => {
    obj.raycast = () => {}
  })
}

export function tagBrick(root: THREE.Object3D, brickId: string): void {
  root.traverse((obj) => {
    obj.userData.brickId = brickId
  })
}
