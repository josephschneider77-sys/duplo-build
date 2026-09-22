import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { BASEPLATE_STUDS, BASEPLATE_THICKNESS, BODY_GAP, PITCH, STUD_HEIGHT, STUD_RADIUS, bodySize, boardOrigin } from './dims.ts'
import type { BrickDef } from './catalog.ts'

/** Inner wall of the open stud. The pin is a second cylinder, not a boolean cut. */
const STUD_INNER = 3.5
const STUD_PIN_RADIUS = 1.6
const CHAMFER = 0.55
/** Design 35114 slope, in radians. */
const SLOPE_ANGLE = (33 * Math.PI) / 180

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
 * Design 35114. High end at -X. Front lip is 1.2; the plane rises 18 over 18/tan(33°).
 * Extruded trapezoid, not a box with shoved vertices.
 */
function slopeGeometry(def: BrickDef): THREE.BufferGeometry {
  return cached(`slope:${def.studsX}x${def.studsZ}x${def.height}`, () => {
    const W = 3 * PITCH - BODY_GAP
    const D = 2 * PITCH - BODY_GAP
    const H = def.height
    const lip = 1.2
    const rise = 18
    const slopeRun = rise / Math.tan(SLOPE_ANGLE)
    const flatW = W - slopeRun

    const shape = new THREE.Shape()
    shape.moveTo(-W / 2, 0)
    shape.lineTo(W / 2, 0)
    shape.lineTo(W / 2, lip)
    shape.lineTo(-W / 2 + flatW, H)
    shape.lineTo(-W / 2, H)
    shape.closePath()

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: D,
      bevelEnabled: false,
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
  opts?: { ghost?: boolean; valid?: boolean },
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

  // Keep a slightly larger pick volume than the visual gap.
  group.userData.pickSize = { w, d, h: def.height }
  return group
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
