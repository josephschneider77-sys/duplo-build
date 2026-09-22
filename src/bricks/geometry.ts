import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { BASEPLATE_STUDS, BASEPLATE_THICKNESS, PITCH, STUD_HEIGHT, STUD_RADIUS, bodySize, boardOrigin } from './dims.ts'
import type { BrickDef } from './catalog.ts'

/** stud7a inner wall is 9 LDU. The pin sits below the rim so the stud reads hollow. */
const STUD_INNER = 3.6
const STUD_PIN_RADIUS = 1.8
const STUD_PIN_RECESS = 1.15
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
    const rim = STUD_HEIGHT
    const pinTop = rim - STUD_PIN_RECESS
    const floor = 0.25
    // One solid of revolution: outer wall, open cup, recessed center pin.
    const points = [
      new THREE.Vector2(STUD_RADIUS, 0),
      new THREE.Vector2(STUD_RADIUS, rim),
      new THREE.Vector2(STUD_INNER, rim),
      new THREE.Vector2(STUD_INNER, floor),
      new THREE.Vector2(STUD_PIN_RADIUS, floor),
      new THREE.Vector2(STUD_PIN_RADIUS, pinTop),
      new THREE.Vector2(0.04, pinTop),
    ]
    const geo = new THREE.LatheGeometry(points, 18)
    geo.translate(0, -rim / 2, 0)
    geo.computeVertexNormals()
    return geo
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
 * Design 11198 side profile: a circular inside bow.
 * LDraw places the soffit center 24 LDU (9.6mm) above the bottom with radius 40 LDU (16mm),
 * so the opening meets the floor and the crown is 32 LDU (12.8mm) thick.
 */
function insideBowGeometry(def: BrickDef): THREE.BufferGeometry {
  return cached(`bow:${def.studsX}x${def.studsZ}x${def.height}`, () => {
    const { w, d } = bodySize(def.studsX, def.studsZ)
    const scale = w / (4 * PITCH)
    const radius = 16 * scale
    const centerY = 9.6 * scale
    const halfChord = Math.sqrt(Math.max(0, radius * radius - centerY * centerY))
    const hw = w / 2
    const foot = Math.min(halfChord, hw - 1)
    const leftAngle = Math.atan2(-centerY, -foot)
    const rightAngle = Math.atan2(-centerY, foot)
    // Long way over the crown. The short sweep between these angles dips below the floor.
    const sweep = rightAngle - leftAngle - Math.PI * 2
    const steps = 32

    const shape = new THREE.Shape()
    shape.moveTo(-hw, 0)
    shape.lineTo(-foot, 0)
    for (let i = 1; i <= steps; i++) {
      const angle = leftAngle + (i / steps) * sweep
      shape.lineTo(Math.cos(angle) * radius, centerY + Math.sin(angle) * radius)
    }
    shape.lineTo(hw, 0)
    shape.lineTo(hw, def.height)
    shape.lineTo(-hw, def.height)
    shape.closePath()

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: d,
      bevelEnabled: false,
      curveSegments: 1,
      steps: 1,
    })
    geo.translate(0, 0, -d / 2)
    geo.computeVertexNormals()
    return geo
  })
}

/**
 * Design 35114 side profile, high end at -X.
 * One stud of flat top, then atan(9.6 / 32) ≈ 17° down to a toe at half height.
 */
function slopeGeometry(def: BrickDef): THREE.BufferGeometry {
  return cached(`slope:${def.studsX}x${def.studsZ}x${def.height}`, () => {
    const { w, d } = bodySize(def.studsX, def.studsZ)
    const hw = w / 2
    const flat = w / def.studsX
    const toeY = def.height / 2
    const shape = new THREE.Shape()
    shape.moveTo(-hw, 0)
    shape.lineTo(hw, 0)
    shape.lineTo(hw, toeY)
    shape.lineTo(-hw + flat, def.height)
    shape.lineTo(-hw, def.height)
    shape.closePath()

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: d,
      bevelEnabled: false,
      curveSegments: 1,
      steps: 1,
    })
    geo.translate(0, 0, -d / 2)
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
