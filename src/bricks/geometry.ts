import * as THREE from 'three'
import { BASEPLATE_STUDS, BASEPLATE_THICKNESS, PITCH, STUD_HEIGHT, STUD_RADIUS, bodySize, boardOrigin } from './dims.ts'
import type { BrickDef } from './catalog.ts'

const studGeometry = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 22)
const bodyGeos = new Map<string, THREE.BufferGeometry>()

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = bodyGeos.get(key)
  if (!geo) {
    geo = make()
    bodyGeos.set(key, geo)
  }
  return geo
}

function rectGeometry(def: BrickDef): THREE.BufferGeometry {
  return cached(`rect:${def.studsX}x${def.studsZ}x${def.height}`, () => {
    const { w, d } = bodySize(def.studsX, def.studsZ)
    return new THREE.BoxGeometry(w, def.height, d)
  })
}

/** Full-height back, thin lip at +X — a chunky Duplo-style ramp. */
function slopeGeometry(def: BrickDef): THREE.BufferGeometry {
  return cached(`slope:${def.studsX}x${def.studsZ}x${def.height}`, () => {
    const { w, d } = bodySize(def.studsX, def.studsZ)
    const geo = new THREE.BoxGeometry(w, def.height, d)
    const pos = geo.attributes.position
    const lip = Math.min(2.4, def.height * 0.14)
    for (let i = 0; i < pos.count; i++) {
      if (pos.getX(i) > 0.001 && pos.getY(i) > 0) {
        pos.setY(i, -def.height / 2 + lip)
      }
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    return geo
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
  const { w, d } = bodySize(def.studsX, def.studsZ)
  const pillarW = bodySize(1, def.studsZ).w
  const openingH = def.height * 0.7
  const lintelH = def.height - openingH

  const pillarGeo = cached(`arch-pillar:${pillarW}:${def.height}:${d}`, () => new THREE.BoxGeometry(pillarW, def.height, d))
  const lintelGeo = cached(`arch-lintel:${w}:${lintelH}:${d}`, () => new THREE.BoxGeometry(w, lintelH, d))

  const left = new THREE.Mesh(pillarGeo, mat)
  left.position.set(-w / 2 + pillarW / 2, def.height / 2, 0)
  const right = new THREE.Mesh(pillarGeo, mat)
  right.position.set(w / 2 - pillarW / 2, def.height / 2, 0)
  const lintel = new THREE.Mesh(lintelGeo, mat)
  lintel.position.set(0, openingH + lintelH / 2, 0)

  for (const mesh of [left, right, lintel]) {
    shade(mesh, ghost)
    group.add(mesh)
  }
}

function addSlopeBody(group: THREE.Group, def: BrickDef, mat: THREE.Material, ghost?: boolean): void {
  const body = new THREE.Mesh(slopeGeometry(def), mat)
  body.position.y = def.height / 2
  shade(body, ghost)
  group.add(body)
}

function addRoundBody(group: THREE.Group, def: BrickDef, mat: THREE.Material, ghost?: boolean): void {
  const { w, d } = bodySize(def.studsX, def.studsZ)
  const radius = Math.min(w, d) / 2
  const geo = cached(`round:${radius}:${def.height}`, () => new THREE.CylinderGeometry(radius, radius, def.height, 36))
  const body = new THREE.Mesh(geo, mat)
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
    // Studs sit on the tall back column so the ramp stays readable.
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

  for (let ix = 0; ix < BASEPLATE_STUDS; ix++) {
    for (let iz = 0; iz < BASEPLATE_STUDS; iz++) {
      const stud = new THREE.Mesh(studGeometry, studMat)
      const sx = origin + ix
      const sz = origin + iz
      stud.position.set((sx + 0.5) * PITCH, STUD_HEIGHT / 2, (sz + 0.5) * PITCH)
      stud.receiveShadow = true
      stud.userData.baseplate = true
      group.add(stud)
    }
  }

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
