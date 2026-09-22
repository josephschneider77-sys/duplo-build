import * as THREE from 'three'
import { defFor, footprint, type BrickDef, type BrickKind } from '../bricks/catalog.ts'
import { PITCH, PLATE_HEIGHT } from '../bricks/dims.ts'

/** Hard cap so a packed baseplate stays a few hundred boxes, not one per triangle. */
const MAX_DEBRIS = 480
const SHRINK = 0.78

export type BurstBrick = {
  kind: BrickKind
  hex: number
  ox: number
  oz: number
  rot: number
  y: number
}

export type Burst = {
  group: THREE.Group
  /** Advance the pop. Returns false when the burst is finished. */
  update: (dt: number) => boolean
  dispose: () => void
}

type Slot = {
  lx: number
  ly: number
  lz: number
  sx: number
  sy: number
  sz: number
}

type Piece = {
  mesh: THREE.InstancedMesh
  index: number
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: THREE.Vector3
  velocity: THREE.Vector3
  spin: THREE.Vector3
  delay: number
}

const chunkGeo = new THREE.BoxGeometry(1, 1, 1)
const _dummy = new THREE.Object3D()
const _euler = new THREE.Euler()
const _spinQ = new THREE.Quaternion()
const _up = new THREE.Vector3(0, 1, 0)
const _out = new THREE.Vector3()
const _bloom = new THREE.Vector3()

/** About two studs per chunk, 2–8 pieces, so the shatter stays chunky. */
function splitsAlong(studs: number): number {
  if (studs <= 1) return 1
  if (studs <= 3) return 2
  return Math.min(4, Math.ceil(studs / 2))
}

function chooseGrid(studsX: number, studsZ: number): { cols: number; rows: number } {
  let cols = splitsAlong(studsX)
  let rows = splitsAlong(studsZ)
  // Skinny bricks (1×4) read better as several cubes than two long bars.
  if (cols * rows < 4 && Math.max(studsX, studsZ) >= 4) {
    if (studsX >= studsZ) cols = Math.min(4, studsX)
    else rows = Math.min(4, studsZ)
  }
  while (cols * rows > 8) {
    const perCol = studsX / cols
    const perRow = studsZ / rows
    if (cols > 1 && (perCol <= perRow || rows === 1)) cols -= 1
    else rows -= 1
  }
  return { cols, rows }
}

function gridSlots(def: BrickDef): Slot[] {
  const { cols, rows } = chooseGrid(def.studsX, def.studsZ)
  const layers = cols * rows === 1 ? 2 : 1
  const spanX = def.studsX * PITCH
  const spanZ = def.studsZ * PITCH
  const cellW = spanX / cols
  const cellD = spanZ / rows
  const cellH = def.height / layers
  const slots: Slot[] = []
  for (let layer = 0; layer < layers; layer++) {
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        let sx = cellW * SHRINK
        let sy = cellH * (layers > 1 ? 0.86 : 0.94)
        let sz = cellD * SHRINK
        let ly = (layer + 0.5) * cellH
        if (def.shape !== 'slope' && layers === 1) {
          // Extra height stands in for the studs so the crack matches the brick silhouette.
          sy = (def.height + 3.2) * 0.9
          ly = sy / 2
        }
        if (def.shape === 'slope' && layers === 1) {
          // Design 6474: 1½-brick high end at local −X, plate-height toe at +X.
          const toe = PLATE_HEIGHT / def.height
          const t = cols <= 1 ? 1 : 1 - col / (cols - 1)
          sy = def.height * (toe + (1 - toe) * t)
          ly = sy / 2
        }
        if (def.shape === 'round') {
          sx *= 0.8
          sz *= 0.8
        }
        slots.push({
          lx: (col + 0.5) * cellW - spanX / 2,
          ly,
          lz: (row + 0.5) * cellD - spanZ / 2,
          sx,
          sy,
          sz,
        })
      }
    }
  }
  return slots
}

/** Pillars and lintel, so an arch breaks into its bridge parts. */
function archSlots(def: BrickDef): Slot[] {
  const spanX = def.studsX * PITCH
  const spanZ = def.studsZ * PITCH
  const pillarW = PITCH * SHRINK
  const depth = spanZ * SHRINK
  const openingH = def.height * 0.7
  const lintelH = (def.height - openingH) * 0.9
  const pillarH = def.height * 0.96
  const lintelY = openingH + (def.height - openingH) / 2
  const halfW = spanX * 0.5 * 0.76
  return [
    { lx: -spanX / 2 + PITCH / 2, ly: pillarH / 2, lz: 0, sx: pillarW, sy: pillarH, sz: depth },
    { lx: spanX / 2 - PITCH / 2, ly: pillarH / 2, lz: 0, sx: pillarW, sy: pillarH, sz: depth },
    { lx: -spanX / 4, ly: lintelY, lz: 0, sx: halfW, sy: lintelH, sz: depth },
    { lx: spanX / 4, ly: lintelY, lz: 0, sx: halfW, sy: lintelH, sz: depth },
  ]
}

function slotsFor(def: BrickDef): Slot[] {
  return def.shape === 'arch' ? archSlots(def) : gridSlots(def)
}

function assignCounts(ideals: number[], maxTotal: number): number[] {
  const n = ideals.length
  const counts = new Array<number>(n).fill(0)
  if (n === 0 || maxTotal <= 0) return counts
  const idealSum = ideals.reduce((sum, count) => sum + count, 0)
  let budget = Math.min(maxTotal, idealSum)

  if (n <= budget) {
    counts.fill(1)
    budget -= n
  } else {
    const step = n / budget
    for (let k = 0; k < budget; k++) {
      const i = Math.min(n - 1, Math.floor(k * step + step * 0.5))
      counts[i] = 1
    }
    return counts
  }

  while (budget > 0) {
    let gave = false
    for (let i = 0; i < n && budget > 0; i++) {
      const ideal = ideals[i] ?? 0
      if (counts[i]! < ideal) {
        counts[i] = (counts[i] ?? 0) + 1
        budget -= 1
        gave = true
      }
    }
    if (!gave) break
  }
  return counts
}

function pickSlots(slots: Slot[], count: number): Slot[] {
  if (count >= slots.length) return slots
  const chosen: Slot[] = []
  const used = new Set<number>()
  for (let k = 0; k < count; k++) {
    let index = Math.min(slots.length - 1, Math.floor(((k + 0.5) * slots.length) / count))
    while (used.has(index) && index + 1 < slots.length) index += 1
    used.add(index)
    const slot = slots[index]
    if (slot) chosen.push(slot)
  }
  return chosen
}

function prefersGentleMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function createBurst(bricks: BurstBrick[]): Burst {
  const gentle = prefersGentleMotion()
  const duration = gentle ? 0.48 : 1.15
  const fadeAt = gentle ? 0.28 : 0.82
  const gravity = gentle ? 48 : 148
  const speedScale = gentle ? 0.38 : 1
  const drag = 0.45

  const group = new THREE.Group()
  group.name = 'burst'

  const plans = bricks.map((brick) => {
    const def = defFor(brick.kind)
    return { brick, def, slots: slotsFor(def) }
  })
  const counts = assignCounts(
    plans.map((plan) => plan.slots.length),
    MAX_DEBRIS,
  )

  const centroid = new THREE.Vector3()
  const origins: THREE.Vector3[] = []
  for (const plan of plans) {
    const { w, d } = footprint(plan.def.studsX, plan.def.studsZ, plan.brick.rot)
    const origin = new THREE.Vector3((plan.brick.ox + w / 2) * PITCH, plan.brick.y, (plan.brick.oz + d / 2) * PITCH)
    origins.push(origin)
    centroid.x += origin.x
    centroid.y += origin.y + plan.def.height / 2
    centroid.z += origin.z
  }
  if (plans.length > 0) centroid.multiplyScalar(1 / plans.length)

  type Draft = {
    hex: number
    position: THREE.Vector3
    quaternion: THREE.Quaternion
    scale: THREE.Vector3
    velocity: THREE.Vector3
    spin: THREE.Vector3
    delay: number
  }
  const drafts: Draft[] = []

  plans.forEach((plan, brickIndex) => {
    const count = counts[brickIndex] ?? 0
    if (count <= 0) return
    const origin = origins[brickIndex]
    if (!origin) return
    const theta = plan.brick.rot * (Math.PI / 2)
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const centerY = origin.y + plan.def.height / 2
    const dist = Math.hypot(origin.x - centroid.x, origin.z - centroid.z)
    const delay = gentle ? Math.min(0.03, dist / 1400) : 0.035 + Math.min(0.1, dist / 720)

    for (const slot of pickSlots(plan.slots, count)) {
      const position = new THREE.Vector3(
        origin.x + slot.lx * cos + slot.lz * sin,
        origin.y + slot.ly,
        origin.z - slot.lx * sin + slot.lz * cos,
      )
      _out.set(position.x - origin.x, position.y - centerY, position.z - origin.z)
      if (_out.lengthSq() < 0.25) _out.set(Math.random() - 0.5, 0.15, Math.random() - 0.5)
      _bloom.set(position.x - centroid.x, 0, position.z - centroid.z)
      if (_bloom.lengthSq() > 9) _out.add(_bloom.normalize().multiplyScalar(gentle ? 4 : 10))
      _out.x += (Math.random() - 0.5) * 3
      _out.z += (Math.random() - 0.5) * 3
      if (_out.lengthSq() < 1e-4) _out.set(0, 1, 0)
      _out.normalize()

      const speed = (96 + Math.random() * 84) * speedScale
      const velocity = _out.clone().multiplyScalar(speed)
      velocity.y += (78 + Math.random() * 70) * speedScale
      velocity.x += (Math.random() - 0.5) * 22 * speedScale
      velocity.z += (Math.random() - 0.5) * 22 * speedScale

      const quaternion = new THREE.Quaternion().setFromAxisAngle(_up, theta)
      const spin = new THREE.Vector3(
        (Math.random() - 0.5) * (gentle ? 3 : 10),
        (Math.random() - 0.5) * (gentle ? 3 : 10),
        (Math.random() - 0.5) * (gentle ? 3 : 10),
      )
      drafts.push({
        hex: plan.brick.hex,
        position,
        quaternion,
        scale: new THREE.Vector3(slot.sx, slot.sy, slot.sz),
        velocity,
        spin,
        delay,
      })
    }
  })

  const buckets = new Map<number, Draft[]>()
  for (const draft of drafts) {
    const list = buckets.get(draft.hex)
    if (list) list.push(draft)
    else buckets.set(draft.hex, [draft])
  }

  const pieces: Piece[] = []
  const meshes: THREE.InstancedMesh[] = []
  const materials: THREE.MeshStandardMaterial[] = []

  for (const [hex, list] of buckets) {
    const material = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.38,
      metalness: 0.04,
      emissive: hex,
      emissiveIntensity: 0,
    })
    const mesh = new THREE.InstancedMesh(chunkGeo, material, list.length)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.raycast = () => {}
    mesh.userData.burst = true
    list.forEach((draft, index) => {
      pieces.push({
        mesh,
        index,
        position: draft.position,
        quaternion: draft.quaternion,
        scale: draft.scale,
        velocity: draft.velocity,
        spin: draft.spin,
        delay: draft.delay,
      })
    })
    group.add(mesh)
    meshes.push(mesh)
    materials.push(material)
  }

  let elapsed = 0

  function writeMatrices(shrink: number, punchWindow: boolean): void {
    for (const piece of pieces) {
      let punch = 1
      if (punchWindow) {
        const localT = elapsed - piece.delay
        if (localT >= 0 && localT < 0.1) punch = 1 + Math.sin((localT / 0.1) * Math.PI) * 0.16
      }
      const s = Math.max(0.001, shrink * punch)
      _dummy.position.copy(piece.position)
      _dummy.quaternion.copy(piece.quaternion)
      _dummy.scale.copy(piece.scale).multiplyScalar(s)
      _dummy.updateMatrix()
      piece.mesh.setMatrixAt(piece.index, _dummy.matrix)
    }
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true
  }

  writeMatrices(1, false)

  function update(dt: number): boolean {
    // One last frame is rendered after time is up so the shrink-out is visible.
    if (elapsed >= duration) return false
    const stepDt = Math.max(dt, 0.008)
    elapsed += stepDt
    const flash = elapsed < 0.16 ? (1 - elapsed / 0.16) * 0.45 : 0
    for (const material of materials) material.emissiveIntensity = flash

    for (const piece of pieces) {
      const localT = elapsed - piece.delay
      if (localT <= 0) continue
      const step = Math.min(stepDt, localT)
      piece.velocity.y -= gravity * step
      piece.velocity.multiplyScalar(Math.exp(-drag * step))
      piece.position.addScaledVector(piece.velocity, step)
      _euler.set(piece.spin.x * step, piece.spin.y * step, piece.spin.z * step)
      _spinQ.setFromEuler(_euler)
      piece.quaternion.multiply(_spinQ)
    }

    let shrink = 1
    if (elapsed > fadeAt) {
      const u = Math.min(1, (elapsed - fadeAt) / (duration - fadeAt))
      shrink = 1 - u * u
    }
    writeMatrices(shrink, !gentle)
    return true
  }

  function dispose(): void {
    for (const mesh of meshes) {
      mesh.removeFromParent()
      mesh.dispose()
    }
    for (const material of materials) material.dispose()
    meshes.length = 0
    materials.length = 0
    pieces.length = 0
  }

  return { group, update, dispose }
}
