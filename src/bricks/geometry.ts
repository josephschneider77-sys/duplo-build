import * as THREE from 'three'
import { BASEPLATE_STUDS, BASEPLATE_THICKNESS, PITCH, STUD_HEIGHT, STUD_RADIUS, bodySize, boardOrigin } from './dims.ts'
import type { BrickDef } from './catalog.ts'

const studGeometry = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 22)
const bodyGeos = new Map<string, THREE.BoxGeometry>()

function bodyGeometry(def: BrickDef): THREE.BoxGeometry {
  const key = `${def.studsX}x${def.studsZ}x${def.height}`
  let geo = bodyGeos.get(key)
  if (!geo) {
    const { w, d } = bodySize(def.studsX, def.studsZ)
    geo = new THREE.BoxGeometry(w, def.height, d)
    bodyGeos.set(key, geo)
  }
  return geo
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

  const body = new THREE.Mesh(bodyGeometry(def), mat)
  body.position.y = def.height / 2
  body.castShadow = !opts?.ghost
  body.receiveShadow = !opts?.ghost
  group.add(body)

  const studY = def.height + STUD_HEIGHT / 2
  for (let ix = 0; ix < def.studsX; ix++) {
    for (let iz = 0; iz < def.studsZ; iz++) {
      const stud = new THREE.Mesh(studGeometry, mat)
      stud.position.set(
        (ix + 0.5) * PITCH - (def.studsX * PITCH) / 2,
        studY,
        (iz + 0.5) * PITCH - (def.studsZ * PITCH) / 2,
      )
      stud.castShadow = !opts?.ghost
      group.add(stud)
    }
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