import * as THREE from './three-draft.js'
import { OrbitControls, TransformControls, GLTFLoader } from './three-draft.js'

/* A deliberately small 3D editor: basic geometry, mesh sub-selection,
   transform, extrude, material, light, preview. No full DCC; deep modeling
   belongs to Blender. This file is a standalone draft. */

const $ = (selector, root = document) => root.querySelector(selector)
const uid = () => `o${Math.random().toString(36).slice(2, 8)}`
const DEG = 180 / Math.PI
const RAD = Math.PI / 180
const PALETTE = ['#34d399', '#60a5fa', '#f59e0b', '#f472b6', '#a78bfa', '#94a3b8']
const SAVE_KEY = 'noven.3d-draft.v3'
/** Payload version stored inside the module's surface state. */
const SCENE_STATE_VERSION = 1

const KIND_LABEL = {
  box: '方块', sphere: '球体', cylinder: '圆柱', cone: '圆锥',
  torus: '圆环', plane: '平面', capsule: '胶囊', model: '模型',
}
/** Kinds that carry an editable vertex/face mesh. */
const MESH_KINDS = new Set(['box', 'plane', 'cylinder', 'cone'])

const state = {
  objects: [],
  lights: [],
  background: '#eef2ee',
  grid: true,
}
let selected = null
let previewMode = false
let mode = 'translate'
let history = []
let historyIndex = -1
let editingField = false
let saveTimer = 0
let toastTimer = 0
let cameraDefault = { position: [4.6, 3.5, 6.4], target: [0, 1, 0] }
/** Module state revision loaded from the card; sent back with every save. */
let surfaceVersion = 0
let saveInFlight = false
let saveQueued = false
let saveBlocked = false

const modelCache = new Map()
const meshes = new Map()
const lightNodes = new Map()

/* ---------- three ---------- */

const viewport = $('#viewport')
const canvas = $('#c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.02
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
camera.position.set(...cameraDefault.position)

const orbit = new OrbitControls(camera, renderer.domElement)
orbit.target.set(...cameraDefault.target)
orbit.enableDamping = true
orbit.dampingFactor = 0.075
orbit.maxPolarAngle = Math.PI * 0.49
orbit.minDistance = 1.8
orbit.maxDistance = 32
orbit.update()

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.ShadowMaterial({ color: 0x1b2a24, opacity: 0.16 }),
)
ground.rotation.x = -Math.PI / 2
ground.position.y = -0.02
ground.receiveShadow = true
scene.add(ground)

const grid = new THREE.GridHelper(24, 24, 0xbfd0c8, 0xe4ebe7)
grid.position.y = -0.012
scene.add(grid)

const objectGroup = new THREE.Group()
const lightGroup = new THREE.Group()
scene.add(objectGroup, lightGroup)

const transform = new TransformControls(camera, renderer.domElement)
transform.setSize(1.05)
const transformHelper = typeof transform.getHelper === 'function' ? transform.getHelper() : transform
scene.add(transformHelper)

const selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0x0e9f6e)
selectionBox.visible = false
selectionBox.material.transparent = true
selectionBox.material.opacity = 0.9
selectionBox.material.depthTest = false
selectionBox.renderOrder = 999
scene.add(selectionBox)

const raycaster = new THREE.Raycaster()

function resize() {
  const width = viewport.clientWidth || 1
  const height = viewport.clientHeight || 1
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
new ResizeObserver(resize).observe(viewport)
resize()

function frame() {
  requestAnimationFrame(frame)
  orbit.update()
  renderer.render(scene, camera)
}
frame()

/* ---------- geometry / materials ---------- */

function primitiveMesh(kind, segments = 12) {
  if (kind === 'box') {
    return {
      vertices: [
        [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
        [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
      ],
      faces: [
        [4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6],
        [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4],
      ],
    }
  }
  if (kind === 'plane') {
    return {
      vertices: [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]],
      faces: [[0, 3, 2, 1]],
    }
  }
  if (kind === 'cylinder') {
    const vertices = []
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2
      vertices.push([Math.cos(angle) * 0.5, -0.6, Math.sin(angle) * 0.5])
    }
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2
      vertices.push([Math.cos(angle) * 0.5, 0.6, Math.sin(angle) * 0.5])
    }
    const faces = []
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments
      faces.push([index, next, segments + next, segments + index])
    }
    faces.push([...Array(segments).keys()].reverse())
    faces.push([...Array(segments).keys()].map(index => segments + index))
    return { vertices, faces }
  }
  if (kind === 'cone') {
    const vertices = []
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2
      vertices.push([Math.cos(angle) * 0.5, -0.6, Math.sin(angle) * 0.5])
    }
    vertices.push([0, 0.6, 0])
    const faces = []
    for (let index = 0; index < segments; index += 1) {
      faces.push([index, (index + 1) % segments, segments])
    }
    faces.push([...Array(segments).keys()].reverse())
    return { vertices, faces }
  }
  return undefined
}

/** Triangulate the editable face list into one flat-shaded BufferGeometry. */
function meshGeometry(mesh) {
  const positions = []
  const triangleFace = []
  for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex += 1) {
    const face = mesh.faces[faceIndex]
    for (let index = 1; index < face.length - 1; index += 1) {
      for (const vertexIndex of [face[0], face[index], face[index + 1]]) {
        const vertex = mesh.vertices[vertexIndex]
        positions.push(vertex[0], vertex[1], vertex[2])
      }
      triangleFace.push(faceIndex)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  geometry.userData.triangleFace = triangleFace
  return geometry
}

function meshEdges(mesh) {
  const seen = new Set()
  const edges = []
  for (const face of mesh.faces) {
    for (let index = 0; index < face.length; index += 1) {
      const a = face[index]
      const b = face[(index + 1) % face.length]
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push([a, b])
    }
  }
  return edges
}

function faceNormal(mesh, face) {
  const normal = new THREE.Vector3()
  for (let index = 0; index < face.length; index += 1) {
    const a = new THREE.Vector3(...mesh.vertices[face[index]])
    const b = new THREE.Vector3(...mesh.vertices[face[(index + 1) % face.length]])
    normal.x += (a.y - b.y) * (a.z + b.z)
    normal.y += (a.z - b.z) * (a.x + b.x)
    normal.z += (a.x - b.x) * (a.y + b.y)
  }
  return normal.normalize()
}

function geometryFor(kind) {
  switch (kind) {
    case 'sphere': return new THREE.SphereGeometry(0.6, 40, 28)
    case 'torus': return new THREE.TorusGeometry(0.55, 0.18, 24, 72)
    case 'capsule': return new THREE.CapsuleGeometry(0.3, 0.8, 8, 20)
    default: return new THREE.BoxGeometry(1, 1, 1)
  }
}

function materialFor(obj) {
  const m = obj.material ?? {}
  const material = new THREE.MeshStandardMaterial({
    color: m.color ?? '#34d399',
    roughness: m.roughness ?? 0.62,
    metalness: m.metalness ?? 0.05,
    transparent: (m.opacity ?? 1) < 1,
    opacity: m.opacity ?? 1,
    side: obj.mesh !== undefined || obj.kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
  })
  if (typeof m.emissive === 'string') {
    material.emissive = new THREE.Color(m.emissive)
    material.emissiveIntensity = m.emissiveIntensity ?? 1
  }
  return material
}

function makeMesh(obj) {
  let node
  if (obj.kind === 'model') {
    const cached = modelCache.get(obj.id)
    if (cached === undefined) return undefined
    node = cached.clone(true)
    node.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        child.userData.objectId = obj.id
      }
    })
  } else {
    const geometry = obj.mesh === undefined ? geometryFor(obj.kind) : meshGeometry(obj.mesh)
    node = new THREE.Mesh(geometry, materialFor(obj))
    node.castShadow = true
    node.receiveShadow = true
    node.userData.objectId = obj.id
  }
  node.position.fromArray(obj.position)
  node.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2])
  node.scale.fromArray(obj.scale)
  node.visible = obj.visible !== false
  return node
}

function rebuildObjects() {
  for (const child of [...objectGroup.children]) objectGroup.remove(child)
  meshes.clear()
  for (const obj of state.objects) {
    const node = makeMesh(obj)
    if (node === undefined) continue
    objectGroup.add(node)
    meshes.set(obj.id, node)
  }
}

function makeLightNode(light) {
  let node
  let marker
  let target
  if (light.kind === 'hemisphere') {
    node = new THREE.HemisphereLight(light.color, '#d9d4c8', light.intensity)
  } else if (light.kind === 'point') {
    node = new THREE.PointLight(light.color, light.intensity, 0, 2)
  } else {
    node = new THREE.DirectionalLight(light.color, light.intensity)
    target = new THREE.Object3D()
    target.position.set(0, 1, 0)
    node.target = target
    node.castShadow = true
    node.shadow.mapSize.set(2048, 2048)
    node.shadow.camera.left = -9
    node.shadow.camera.right = 9
    node.shadow.camera.top = 9
    node.shadow.camera.bottom = -9
    node.shadow.camera.near = 0.5
    node.shadow.camera.far = 40
    node.shadow.bias = -0.0004
    node.shadow.normalBias = 0.02
  }
  if (light.kind !== 'hemisphere') {
    node.position.fromArray(light.position ?? [0, 3, 0])
    marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 18, 14),
      new THREE.MeshBasicMaterial({ color: light.color }),
    )
    marker.raycast = () => {}
    marker.visible = false
    node.add(marker)
  }
  node.visible = light.visible !== false
  return { node, marker, target }
}

function rebuildLights() {
  for (const child of [...lightGroup.children]) lightGroup.remove(child)
  lightNodes.clear()
  for (const light of state.lights) {
    const built = makeLightNode(light)
    lightGroup.add(built.node)
    if (built.target !== undefined) lightGroup.add(built.target)
    lightNodes.set(light.id, built)
  }
}

function rebuildAll() {
  rebuildObjects()
  rebuildLights()
  applyBackground()
  grid.visible = state.grid
  renderOutliner()
  renderInspector()
  updateEmpty()
  if (meshEdit !== null) {
    transform.detach()
    updateMeshHelpers()
    updateMeshPivot()
  } else if (selected !== null) {
    const node = selected.type === 'object' ? meshes.get(selected.id) : lightNodes.get(selected.id)?.node
    if (node !== undefined && !previewMode) transform.attach(node)
    else transform.detach()
  } else {
    transform.detach()
  }
  updateSelectionBox()
  updateLightMarkers()
  updateHistoryButtons()
}

/* ---------- selection ---------- */

function selectedNode() {
  if (selected === null) return undefined
  return selected.type === 'object' ? meshes.get(selected.id) : lightNodes.get(selected.id)?.node
}

function updateLightMarkers() {
  for (const [id, entry] of lightNodes) {
    if (entry.marker !== undefined) {
      entry.marker.visible = !previewMode && selected !== null && selected.type === 'light' && selected.id === id
    }
  }
}

function select(type, id) {
  if (meshEdit !== null && (type !== 'object' || id !== meshEdit.objectId)) exitMeshMode()
  selected = type === null || id === null ? null : { type, id }
  updateLightMarkers()
  if (meshEdit !== null) {
    updateMeshPivot()
    renderInspector()
    renderOutliner()
    return
  }
  const node = selectedNode()
  if (node !== undefined && !previewMode) transform.attach(node)
  else transform.detach()
  updateSelectionBox()
  renderInspector()
  renderOutliner()
}

function updateSelectionBox() {
  if (meshEdit !== null) {
    selectionBox.visible = false
    return
  }
  const node = selectedNode()
  if (node === undefined || previewMode || selected === null) {
    selectionBox.visible = false
    return
  }
  selectionBox.setFromObject(node)
  selectionBox.visible = true
}

function syncFromNode() {
  if (selected === null) return
  const node = selectedNode()
  if (node === undefined) return
  if (selected.type === 'object') {
    const obj = state.objects.find(candidate => candidate.id === selected.id)
    if (obj === undefined) return
    obj.position = node.position.toArray()
    obj.rotation = [node.rotation.x, node.rotation.y, node.rotation.z]
    obj.scale = node.scale.toArray()
  } else {
    const light = state.lights.find(candidate => candidate.id === selected.id)
    if (light === undefined) return
    light.position = node.position.toArray()
  }
  updateSelectionBox()
  syncInspectorValues()
  scheduleSave()
}

/* ---------- mesh editing ---------- */

let meshEdit = null
let meshDragStartMatrix = null
let meshDragStartVertices = []
/** Edge bevel width in world units, clamped per adjacent edge. */
const BEVEL_WIDTH = 0.12
const meshHelper = new THREE.Group()
meshHelper.visible = false
scene.add(meshHelper)
const meshPivot = new THREE.Object3D()
meshPivot.visible = false
scene.add(meshPivot)

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

/** Index face lists by undirected edge and by vertex. */
function meshTopology(mesh) {
  const edgeFaces = new Map()
  const vertexFaces = new Map()
  for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex += 1) {
    const face = mesh.faces[faceIndex]
    for (let index = 0; index < face.length; index += 1) {
      const key = edgeKey(face[index], face[(index + 1) % face.length])
      const faces = edgeFaces.get(key)
      if (faces === undefined) edgeFaces.set(key, [faceIndex])
      else if (!faces.includes(faceIndex)) faces.push(faceIndex)
    }
    for (const vertexIndex of new Set(face)) {
      const faces = vertexFaces.get(vertexIndex)
      if (faces === undefined) vertexFaces.set(vertexIndex, [faceIndex])
      else if (!faces.includes(faceIndex)) faces.push(faceIndex)
    }
  }
  return { edgeFaces, vertexFaces }
}

/**
 * Faces around one vertex, ordered from `from` to `to` without crossing `skipKey`.
 * @param topo - edge/vertex index from `meshTopology`.
 * @param mesh - vertex and face lists.
 * @param vertex - the shared vertex.
 * @param from - first face of the fan (one side of the skipped edge).
 * @param to - last face of the fan (the other side).
 * @param skipKey - the edge to walk around, not across.
 * @returns ordered faces and the transition edges between them, or undefined at
 *   a boundary/non-manifold vertex.
 */
function vertexFan(topo, mesh, vertex, from, to, skipKey) {
  const incident = topo.vertexFaces.get(vertex) ?? []
  if (!incident.includes(from) || !incident.includes(to)) return undefined
  const path = [from]
  const links = []
  let faceIndex = from
  let enteredBy
  for (let guard = 0; guard <= incident.length; guard += 1) {
    const face = mesh.faces[faceIndex]
    const at = face.indexOf(vertex)
    if (at < 0) return undefined
    const previous = face[(at - 1 + face.length) % face.length]
    const next = face[(at + 1) % face.length]
    let step
    for (const other of previous === next ? [previous] : [previous, next]) {
      const key = edgeKey(vertex, other)
      if (key === skipKey || key === enteredBy) continue
      const faces = topo.edgeFaces.get(key)
      if (faces === undefined || faces.length !== 2) return undefined
      const adjacent = faces[0] === faceIndex ? faces[1] : faces[0]
      if (step !== undefined) return undefined
      step = { key, other, face: adjacent }
    }
    if (step === undefined) return undefined
    if (step.face === to) {
      path.push(to)
      links.push(step)
      return { path, links }
    }
    if (path.includes(step.face)) return undefined
    path.push(step.face)
    links.push(step)
    enteredBy = step.key
    faceIndex = step.face
  }
  return undefined
}

/** Drop vertices no face references and renumber the remaining ones. */
function compactMesh(mesh) {
  const used = new Set()
  for (const face of mesh.faces) for (const vertexIndex of face) used.add(vertexIndex)
  if (used.size === mesh.vertices.length) return
  const remap = new Map()
  const vertices = []
  for (let index = 0; index < mesh.vertices.length; index += 1) {
    if (!used.has(index)) continue
    remap.set(index, vertices.length)
    vertices.push(mesh.vertices[index])
  }
  mesh.vertices = vertices
  mesh.faces = mesh.faces.map(face => face.map(vertexIndex => remap.get(vertexIndex)))
}

function meshTarget() {
  if (meshEdit === null) return undefined
  return state.objects.find(obj => obj.id === meshEdit.objectId)
}

function activeSelection() {
  if (meshEdit === null) return new Set()
  if (meshEdit.pick === 'vertex') return meshEdit.vertices
  if (meshEdit.pick === 'edge') return meshEdit.edges
  return meshEdit.faces
}

function selectedFaceIndices() {
  if (meshEdit === null || meshEdit.pick !== 'face') return []
  return [...meshEdit.faces]
}

function meshVertexIndices() {
  const obj = meshTarget()
  if (obj?.mesh === undefined || meshEdit === null) return []
  const indices = new Set()
  if (meshEdit.pick === 'vertex') {
    for (const index of meshEdit.vertices) indices.add(index)
  } else if (meshEdit.pick === 'edge') {
    for (const edgeIndex of meshEdit.edges) {
      const pair = meshEdit.edgeList[edgeIndex]
      if (pair !== undefined) for (const index of pair) indices.add(index)
    }
  } else {
    for (const faceIndex of meshEdit.faces) {
      const face = obj.mesh.faces[faceIndex]
      if (face !== undefined) for (const index of face) indices.add(index)
    }
  }
  return [...indices]
}

function updateObjectGeometry(obj) {
  const node = meshes.get(obj.id)
  if (node === undefined || obj.mesh === undefined) return
  const geometry = meshGeometry(obj.mesh)
  node.geometry.dispose()
  node.geometry = geometry
}

function clearMeshHelper() {
  for (const child of [...meshHelper.children]) {
    meshHelper.remove(child)
    child.geometry?.dispose()
    child.material?.dispose()
  }
}

function updateMeshHelpers() {
  clearMeshHelper()
  const obj = meshTarget()
  if (obj?.mesh === undefined || meshEdit === null) {
    meshHelper.visible = false
    return
  }
  meshHelper.visible = true
  const mesh = obj.mesh
  const edgeList = meshEdges(mesh)
  meshEdit.edgeList = edgeList
  const selected = new Set(meshVertexIndices())
  const mint = new THREE.Color('#0e9f6e')
  const ink = new THREE.Color('#42544b')

  const pointPositions = []
  const pointColors = []
  for (let index = 0; index < mesh.vertices.length; index += 1) {
    const vertex = mesh.vertices[index]
    pointPositions.push(vertex[0], vertex[1], vertex[2])
    const color = selected.has(index) ? mint : ink
    pointColors.push(color.r, color.g, color.b)
  }
  const pointGeometry = new THREE.BufferGeometry()
  pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3))
  pointGeometry.setAttribute('color', new THREE.Float32BufferAttribute(pointColors, 3))
  const points = new THREE.Points(pointGeometry, new THREE.PointsMaterial({
    size: 0.075, vertexColors: true, sizeAttenuation: true,
    depthTest: false, transparent: true, opacity: 0.95,
  }))
  points.renderOrder = 6
  meshHelper.add(points)

  const highlighted = new Set()
  if (meshEdit.pick === 'edge') {
    for (const edgeIndex of meshEdit.edges) {
      const pair = edgeList[edgeIndex]
      if (pair !== undefined) {
        const [a, b] = pair
        highlighted.add(a < b ? `${a}:${b}` : `${b}:${a}`)
      }
    }
  } else if (meshEdit.pick === 'face') {
    for (const faceIndex of meshEdit.faces) {
      const face = mesh.faces[faceIndex]
      if (face === undefined) continue
      for (let index = 0; index < face.length; index += 1) {
        const a = face[index]
        const b = face[(index + 1) % face.length]
        highlighted.add(a < b ? `${a}:${b}` : `${b}:${a}`)
      }
    }
  }

  const linePositions = []
  const lineColors = []
  for (const [a, b] of edgeList) {
    const va = mesh.vertices[a]
    const vb = mesh.vertices[b]
    linePositions.push(va[0], va[1], va[2], vb[0], vb[1], vb[2])
    const color = highlighted.has(a < b ? `${a}:${b}` : `${b}:${a}`) ? mint : new THREE.Color('#7c8b83')
    lineColors.push(color.r, color.g, color.b, color.r, color.g, color.b)
  }
  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3))
  lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3))
  const lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.8, depthTest: false,
  }))
  lines.renderOrder = 5
  meshHelper.add(lines)

  if (meshEdit.pick === 'face' && meshEdit.faces.size > 0) {
    const positions = []
    for (const faceIndex of meshEdit.faces) {
      const face = mesh.faces[faceIndex]
      if (face === undefined) continue
      for (let index = 1; index < face.length - 1; index += 1) {
        for (const vertexIndex of [face[0], face[index], face[index + 1]]) {
          const vertex = mesh.vertices[vertexIndex]
          positions.push(vertex[0], vertex[1], vertex[2])
        }
      }
    }
    if (positions.length > 0) {
      const faceGeometry = new THREE.BufferGeometry()
      faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      const overlay = new THREE.Mesh(faceGeometry, new THREE.MeshBasicMaterial({
        color: 0x0e9f6e, transparent: true, opacity: 0.24, side: THREE.DoubleSide,
        depthTest: false, depthWrite: false,
      }))
      overlay.renderOrder = 4
      meshHelper.add(overlay)
    }
  }
}

function updateMeshPivot() {
  if (meshEdit === null) {
    transform.detach()
    meshPivot.visible = false
    return
  }
  const obj = meshTarget()
  const indices = meshVertexIndices()
  if (obj?.mesh === undefined || indices.length === 0) {
    transform.detach()
    meshPivot.visible = false
    return
  }
  const centroid = new THREE.Vector3()
  for (const index of indices) centroid.add(new THREE.Vector3(...obj.mesh.vertices[index]))
  centroid.divideScalar(indices.length)
  meshPivot.position.copy(centroid)
  meshPivot.rotation.set(0, 0, 0)
  meshPivot.scale.set(1, 1, 1)
  meshPivot.updateMatrix()
  meshPivot.visible = true
  transform.attach(meshPivot)
  transform.setMode(mode)
}

function selectMesh(value, additive = false) {
  if (meshEdit === null) return
  const set = activeSelection()
  if (value === null) {
    if (!additive) set.clear()
  } else if (additive) {
    if (set.has(value)) set.delete(value)
    else set.add(value)
  } else {
    set.clear()
    set.add(value)
  }
  updateMeshHelpers()
  updateMeshPivot()
  renderMeshInspector()
  updateMeshUI()
}

function updatePickButtons(kind) {
  for (const button of document.querySelectorAll('[data-pick]')) {
    if (button.dataset.pick === kind) button.dataset.on = ''
    else delete button.dataset.on
  }
}

function setMeshPick(kind) {
  if (meshEdit === null) return
  meshEdit.pick = kind
  meshEdit.faces.clear()
  meshEdit.edges.clear()
  meshEdit.vertices.clear()
  updatePickButtons(kind)
  updateMeshHelpers()
  updateMeshPivot()
  renderMeshInspector()
  updateMeshUI()
}

function updateMeshUI() {
  const tools = $('#meshTools')
  if (tools !== null) tools.hidden = meshEdit === null
  const objectButton = $('#objectMode')
  const meshButton = $('#meshMode')
  if (objectButton !== null) {
    if (meshEdit === null) objectButton.dataset.on = ''
    else delete objectButton.dataset.on
  }
  if (meshButton !== null) {
    if (meshEdit !== null) meshButton.dataset.on = ''
    else delete meshButton.dataset.on
  }
  const faceOps = meshEdit !== null && meshEdit.pick === 'face' && meshEdit.faces.size > 0
  for (const id of ['extrude', 'inset', 'faceBevel', 'subdivide']) {
    const button = $(`#${id}`)
    if (button !== null) button.disabled = !faceOps
  }
  const bridge = $('#bridge')
  if (bridge !== null) bridge.disabled = !(meshEdit !== null && meshEdit.pick === 'face' && meshEdit.faces.size === 2)
  const edgeOps = meshEdit !== null && meshEdit.pick === 'edge' && meshEdit.edges.size > 0
  const edgeBevel = $('#edgeBevel')
  if (edgeBevel !== null) edgeBevel.disabled = !edgeOps
  const loopCut = $('#loopCut')
  if (loopCut !== null) loopCut.disabled = !(meshEdit !== null && meshEdit.pick === 'edge' && meshEdit.edges.size === 1)
  const info = $('#meshInfo')
  if (info !== null) {
    if (meshEdit === null) {
      info.textContent = ''
    } else {
      const count = activeSelection().size
      const unit = meshEdit.pick === 'face' ? '个面' : meshEdit.pick === 'edge' ? '条边' : '个点'
      info.textContent = count === 0
        ? '点一下模型上的面/边/点 · Shift 多选'
        : `已选 ${String(count)} ${unit} · ${String(meshVertexIndices().length)} 个点 · Shift 多选`
    }
  }
}

function bakeMeshTransform(obj) {
  const node = meshes.get(obj.id)
  if (node === undefined || obj.mesh === undefined) return
  node.updateMatrixWorld(true)
  const matrix = node.matrixWorld.clone()
  obj.mesh.vertices = obj.mesh.vertices.map(vertex =>
    new THREE.Vector3(vertex[0], vertex[1], vertex[2]).applyMatrix4(matrix).toArray())
  obj.position = [0, 0, 0]
  obj.rotation = [0, 0, 0]
  obj.scale = [1, 1, 1]
}

function enterMeshMode() {
  if (meshEdit !== null) return
  if (selected === null || selected.type !== 'object') {
    toast('先选中一个方块/平面/圆柱/圆锥')
    return
  }
  const obj = state.objects.find(candidate => candidate.id === selected.id)
  if (obj?.mesh === undefined) {
    toast('这个基础体暂时只支持物体编辑；试试方块/平面/圆柱/圆锥')
    return
  }
  bakeMeshTransform(obj)
  meshEdit = {
    objectId: obj.id, pick: 'face',
    faces: new Set(), edges: new Set(), vertices: new Set(), edgeList: [],
  }
  meshHelper.visible = true
  selected = { type: 'object', id: obj.id }
  rebuildAll()
  updateMeshPivot()
  renderInspector()
  updateMeshUI()
  commitHistory()
  scheduleSave()
  toast('网格模式：Shift 多选；面可挤出/内插/倒角/细分，边可倒角/环切')
}

function exitMeshMode() {
  if (meshEdit === null) return
  meshEdit = null
  meshDragStartMatrix = null
  meshDragStartVertices = []
  meshHelper.visible = false
  clearMeshHelper()
  meshPivot.visible = false
  transform.detach()
  renderInspector()
  updateMeshUI()
  if (selected !== null && selected.type === 'object') {
    const node = meshes.get(selected.id)
    if (node !== undefined) transform.attach(node)
  }
  updateSelectionBox()
}

function syncMeshFromPivot() {
  if (meshEdit === null || meshDragStartMatrix === null) return
  const obj = meshTarget()
  if (obj?.mesh === undefined) return
  meshPivot.updateMatrix()
  const delta = meshPivot.matrix.clone().multiply(meshDragStartMatrix.clone().invert())
  const indices = meshVertexIndices()
  for (let index = 0; index < indices.length; index += 1) {
    const vertex = meshDragStartVertices[index].clone().applyMatrix4(delta)
    obj.mesh.vertices[indices[index]] = vertex.toArray()
  }
  updateObjectGeometry(obj)
  updateMeshHelpers()
  scheduleSave()
}

function pickMeshElement(mouse, additive) {
  if (meshEdit === null) return
  const obj = meshTarget()
  if (obj?.mesh === undefined) return
  raycaster.setFromCamera(mouse, camera)
  raycaster.params.Points.threshold = 0.09
  raycaster.params.Line.threshold = 0.06
  if (meshEdit.pick === 'vertex') {
    const points = meshHelper.children.find(child => child.isPoints)
    const hit = points === undefined ? undefined : raycaster.intersectObject(points, false)[0]
    if (hit?.index === undefined) { selectMesh(null, additive); return }
    selectMesh(hit.index, additive)
    return
  }
  if (meshEdit.pick === 'edge') {
    const lines = meshHelper.children.find(child => child.isLineSegments)
    const hit = lines === undefined ? undefined : raycaster.intersectObject(lines, false)[0]
    if (hit?.index === undefined) { selectMesh(null, additive); return }
    selectMesh(Math.floor(hit.index / 2), additive)
    return
  }
  const node = meshes.get(obj.id)
  const hit = node === undefined ? undefined : raycaster.intersectObject(node, false)[0]
  const faceIndex = hit?.faceIndex
  if (faceIndex === undefined) { selectMesh(null, additive); return }
  const face = node.geometry.userData.triangleFace?.[faceIndex]
  if (face === undefined) { selectMesh(null, additive); return }
  selectMesh(face, additive)
}

function extrudeSelectedFaces() {
  if (meshEdit === null || meshEdit.pick !== 'face' || meshEdit.faces.size === 0) return
  const obj = meshTarget()
  if (obj?.mesh === undefined) return
  const mesh = obj.mesh
  const selected = [...meshEdit.faces].sort((a, b) => a - b)
  if (mesh.faces.length > 1 && selected.length === mesh.faces.length) {
    toast('留一个面不选，才能挤出')
    return
  }
  const normal = new THREE.Vector3()
  for (const faceIndex of selected) normal.add(faceNormal(mesh, mesh.faces[faceIndex]))
  if (normal.lengthSq() === 0) normal.set(0, 1, 0)
  normal.normalize()
  const distance = 0.35
  const duplicated = new Map()
  for (const faceIndex of selected) {
    for (const vertexIndex of mesh.faces[faceIndex]) {
      if (duplicated.has(vertexIndex)) continue
      const vertex = new THREE.Vector3(...mesh.vertices[vertexIndex]).addScaledVector(normal, distance)
      mesh.vertices.push(vertex.toArray())
      duplicated.set(vertexIndex, mesh.vertices.length - 1)
    }
  }
  const selectedFaces = selected.map(faceIndex => mesh.faces[faceIndex])
  const counts = new Map()
  const directed = new Map()
  for (const face of selectedFaces) {
    for (let index = 0; index < face.length; index += 1) {
      const a = face[index]
      const b = face[(index + 1) % face.length]
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
      if (!directed.has(key)) directed.set(key, [a, b])
    }
  }
  const open = mesh.faces.length === 1
  if (!open) {
    for (const faceIndex of [...selected].sort((a, b) => b - a)) mesh.faces.splice(faceIndex, 1)
  } else {
    mesh.faces[selected[0]] = [...mesh.faces[selected[0]]].reverse()
  }
  for (const [key, count] of counts) {
    if (count !== 1) continue
    const [a, b] = directed.get(key)
    const na = duplicated.get(a)
    const nb = duplicated.get(b)
    if (na === undefined || nb === undefined) continue
    mesh.faces.push([a, b, nb, na])
  }
  const nextFaces = []
  for (const face of selectedFaces) {
    if (face === undefined) continue
    const copy = face.map(vertexIndex => duplicated.get(vertexIndex))
    if (copy.some(vertexIndex => vertexIndex === undefined)) continue
    mesh.faces.push(copy)
    nextFaces.push(mesh.faces.length - 1)
  }
  updateObjectGeometry(obj)
  meshEdit.faces = new Set(nextFaces)
  meshEdit.edges.clear()
  meshEdit.vertices.clear()
  meshEdit.pick = 'face'
  updateMeshHelpers()
  updateMeshPivot()
  renderMeshInspector()
  updateMeshUI()
  commitHistory()
  scheduleSave()
  toast('已挤出面')
}

function insetSelectedFaces(lift) {
  if (meshEdit === null || meshEdit.pick !== 'face' || meshEdit.faces.size === 0) return
  const obj = meshTarget()
  if (obj?.mesh === undefined) return
  const mesh = obj.mesh
  const selected = [...meshEdit.faces]
  const amount = 0.22
  for (const faceIndex of selected) {
    const face = mesh.faces[faceIndex]
    if (face === undefined) continue
    const normal = faceNormal(mesh, face)
    const centroid = new THREE.Vector3()
    for (const vertexIndex of face) centroid.add(new THREE.Vector3(...mesh.vertices[vertexIndex]))
    centroid.divideScalar(face.length)
    const inner = face.map(vertexIndex => {
      const vertex = new THREE.Vector3(...mesh.vertices[vertexIndex])
      const point = vertex.clone().lerp(centroid, amount)
      if (lift !== 0) point.addScaledVector(normal, lift)
      mesh.vertices.push(point.toArray())
      return mesh.vertices.length - 1
    })
    mesh.faces[faceIndex] = inner
    for (let index = 0; index < face.length; index += 1) {
      const a = face[index]
      const b = face[(index + 1) % face.length]
      const ia = inner[index]
      const ib = inner[(index + 1) % face.length]
      mesh.faces.push([a, b, ib, ia])
    }
  }
  updateObjectGeometry(obj)
  updateMeshHelpers()
  updateMeshPivot()
  renderMeshInspector()
  updateMeshUI()
  commitHistory()
  scheduleSave()
  toast(lift === 0 ? '已内插选中的面' : '已倒角选中的面')
}

function subdivideSelectedFaces() {
  if (meshEdit === null || meshEdit.pick !== 'face' || meshEdit.faces.size === 0) return
  const obj = meshTarget()
  if (obj?.mesh === undefined) return
  const mesh = obj.mesh
  const selected = [...meshEdit.faces]
  const nextFaces = new Set()
  for (const faceIndex of selected) {
    const face = mesh.faces[faceIndex]
    if (face === undefined) continue
    const centroid = new THREE.Vector3()
    for (const vertexIndex of face) centroid.add(new THREE.Vector3(...mesh.vertices[vertexIndex]))
    centroid.divideScalar(face.length)
    mesh.vertices.push(centroid.toArray())
    const center = mesh.vertices.length - 1
    for (let index = 0; index < face.length; index += 1) {
      const triangle = [face[index], face[(index + 1) % face.length], center]
      if (index === 0) mesh.faces[faceIndex] = triangle
      else mesh.faces.push(triangle)
      nextFaces.add(index === 0 ? faceIndex : mesh.faces.length - 1)
    }
  }
  updateObjectGeometry(obj)
  meshEdit.faces = nextFaces
  meshEdit.edges.clear()
  meshEdit.vertices.clear()
  meshEdit.pick = 'face'
  updateMeshHelpers()
  updateMeshPivot()
  renderMeshInspector()
  updateMeshUI()
  commitHistory()
  scheduleSave()
  toast('已细分选中的面')
}

/**
 * Chamfer selected edges. Every selected edge must be manifold and the
 * selected edges must not share a vertex; the cut runs around each endpoint's
 * face fan, so the bevel terminates consistently on closed meshes.
 */
function bevelSelectedEdges() {
  if (meshEdit === null || meshEdit.pick !== 'edge' || meshEdit.edges.size === 0) return
  const obj = meshTarget()
  if (obj?.mesh === undefined) return
  const mesh = obj.mesh
  const pairs = []
  const used = new Set()
  for (const edgeIndex of meshEdit.edges) {
    const pair = meshEdit.edgeList[edgeIndex]
    if (pair === undefined) continue
    if (used.has(pair[0]) || used.has(pair[1])) {
      toast('倒角：选中的边不能共用顶点；分开倒，或选互不相邻的边')
      return
    }
    used.add(pair[0])
    used.add(pair[1])
    pairs.push(pair)
  }
  if (pairs.length === 0) return

  const topo = meshTopology(mesh)
  const added = []
  const pointIndex = new Map()
  const pointAt = (vertex, other) => {
    const key = `${vertex}|${edgeKey(vertex, other)}`
    const known = pointIndex.get(key)
    if (known !== undefined) return known
    const from = new THREE.Vector3(...mesh.vertices[vertex])
    const to = new THREE.Vector3(...mesh.vertices[other])
    const length = from.distanceTo(to)
    const travel = length === 0 ? 0 : Math.min(BEVEL_WIDTH, length * 0.32) / length
    added.push(from.clone().lerp(to, travel).toArray())
    const index = mesh.vertices.length + added.length - 1
    pointIndex.set(key, index)
    return index
  }
  const replacements = new Map()
  const chamfers = []
  for (const [a, b] of pairs) {
    const key = edgeKey(a, b)
    const sides = topo.edgeFaces.get(key) ?? []
    if (sides.length !== 2) {
      toast('倒角：边界边或非流形边暂不支持')
      return
    }
    const arcs = []
    for (const vertex of [a, b]) {
      const fan = vertexFan(topo, mesh, vertex, sides[0], sides[1], key)
      if (fan === undefined || fan.links.length < 2) {
        toast('倒角：这条边的端点不是封闭流形，暂不支持')
        return
      }
      arcs.push({ vertex, fan, points: fan.links.map(link => pointAt(vertex, link.other)) })
    }
    for (const end of arcs) {
      const pointByKey = new Map(end.fan.links.map((link, index) => [link.key, end.points[index]]))
      for (const faceIndex of end.fan.path) {
        const face = mesh.faces[faceIndex]
        const at = face.indexOf(end.vertex)
        if (at < 0) return
        const previous = face[(at - 1 + face.length) % face.length]
        const next = face[(at + 1) % face.length]
        const values = []
        const onPrevious = pointByKey.get(edgeKey(end.vertex, previous))
        const onNext = pointByKey.get(edgeKey(end.vertex, next))
        if (onPrevious !== undefined) values.push(onPrevious)
        if (onNext !== undefined) values.push(onNext)
        if (values.length === 0) return
        let perFace = replacements.get(faceIndex)
        if (perFace === undefined) {
          perFace = new Map()
          replacements.set(faceIndex, perFace)
        }
        if (perFace.has(end.vertex)) return
        perFace.set(end.vertex, values)
      }
    }
    const first = arcs[0].points
    const second = arcs[1].points
    chamfers.push([
      first[0], second[0], ...second.slice(1),
      first[first.length - 1], ...first.slice(1, -1).reverse(),
    ])
  }
  const rebuilt = []
  for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex += 1) {
    const face = mesh.faces[faceIndex]
    const perFace = replacements.get(faceIndex)
    if (perFace === undefined) {
      rebuilt.push(face)
      continue
    }
    const next = []
    for (const vertexIndex of face) {
      const values = perFace.get(vertexIndex)
      if (values === undefined) next.push(vertexIndex)
      else next.push(...values)
    }
    if (next.length < 3) {
      toast('倒角：选中的边太短，会产生退化面')
      return
    }
    rebuilt.push(next)
  }
  for (const point of added) mesh.vertices.push(point)
  mesh.faces = rebuilt
  const chamferFaces = []
  for (const face of chamfers) {
    mesh.faces.push(face)
    chamferFaces.push(mesh.faces.length - 1)
  }
  compactMesh(mesh)
  updateObjectGeometry(obj)
  meshEdit.pick = 'face'
  meshEdit.faces = new Set(chamferFaces)
  meshEdit.edges = new Set()
  meshEdit.vertices = new Set()
  updatePickButtons('face')
  updateMeshHelpers()
  updateMeshPivot()
  renderMeshInspector()
  updateMeshUI()
  commitHistory()
  scheduleSave()
  toast(`已倒角 ${String(pairs.length)} 条边，选中了倒角面`)
}

/**
 * Cut a closed ring of quads across the selected edge and select the new ring.
 * Aborts instead of creating T-junctions when the ring hits a non-quad.
 */
function loopCutSelectedEdge() {
  if (meshEdit === null || meshEdit.pick !== 'edge' || meshEdit.edges.size !== 1) {
    toast('环切：先在边模式下选中一条边')
    return
  }
  const obj = meshTarget()
  if (obj?.mesh === undefined) return
  const mesh = obj.mesh
  const pair = meshEdit.edgeList[[...meshEdit.edges][0]]
  if (pair === undefined) return
  const startKey = edgeKey(pair[0], pair[1])
  const topo = meshTopology(mesh)
  const startSides = topo.edgeFaces.get(startKey) ?? []
  if (startSides.length !== 2) {
    toast('环切：边界边不适合环切')
    return
  }
  const startFace = startSides[0]
  const loop = []
  const visited = new Set()
  let current = startFace
  let entryKey = startKey
  let closed = false
  for (let guard = 0; guard <= mesh.faces.length; guard += 1) {
    if (visited.has(current)) {
      toast('环切：需要一条完整的四边面环')
      return
    }
    visited.add(current)
    const face = mesh.faces[current]
    if (face.length !== 4) {
      toast('环切：需要一条完整的四边面环（碰到非四边面）')
      return
    }
    const at = face.findIndex((vertexIndex, index) => edgeKey(vertexIndex, face[(index + 1) % 4]) === entryKey)
    if (at < 0) {
      toast('环切失败：拓扑不连续')
      return
    }
    const exitKey = edgeKey(face[(at + 2) % 4], face[(at + 3) % 4])
    loop.push({ faceIndex: current, at, entryKey, exitKey })
    const sides = topo.edgeFaces.get(exitKey) ?? []
    if (sides.length !== 2) {
      toast('环切：需要一条闭合的四边面环')
      return
    }
    const next = sides[0] === current ? sides[1] : sides[0]
    if (next === startFace) {
      closed = true
      break
    }
    current = next
    entryKey = exitKey
  }
  if (!closed || loop.length < 2) {
    toast('环切：找不到连续闭合的四边面环')
    return
  }

  const midpoints = new Map()
  const midpoint = key => {
    const known = midpoints.get(key)
    if (known !== undefined) return known
    const [a, b] = key.split(':').map(Number)
    const from = new THREE.Vector3(...mesh.vertices[a])
    const to = new THREE.Vector3(...mesh.vertices[b])
    mesh.vertices.push(from.lerp(to, 0.5).toArray())
    const index = mesh.vertices.length - 1
    midpoints.set(key, index)
    return index
  }
  const cutEdges = []
  for (const item of loop) {
    const face = mesh.faces[item.faceIndex]
    const entryMid = midpoint(item.entryKey)
    const exitMid = midpoint(item.exitKey)
    mesh.faces[item.faceIndex] = [face[item.at], entryMid, exitMid, face[(item.at + 3) % 4]]
    mesh.faces.push([entryMid, face[(item.at + 1) % 4], face[(item.at + 2) % 4], exitMid])
    cutEdges.push([entryMid, exitMid])
  }
  updateObjectGeometry(obj)
  const edges = meshEdges(mesh)
  const wanted = new Set(cutEdges.map(([a, b]) => edgeKey(a, b)))
  meshEdit.pick = 'edge'
  meshEdit.faces = new Set()
  meshEdit.vertices = new Set()
  meshEdit.edges = new Set()
  edges.forEach(([a, b], index) => {
    if (wanted.has(edgeKey(a, b))) meshEdit.edges.add(index)
  })
  meshEdit.edgeList = edges
  updatePickButtons('edge')
  updateMeshHelpers()
  updateMeshPivot()
  renderMeshInspector()
  updateMeshUI()
  commitHistory()
  scheduleSave()
  toast(`已环切 ${String(loop.length)} 个四边面，选中新环`)
}

/**
 * Bridge two equal-sided faces whose boundaries are not already joined by
 * existing geometry. Refusing a pre-existing cross edge keeps the result
 * manifold instead of stacking a duplicate wall.
 */
function bridgeSelectedFaces() {
  if (meshEdit === null || meshEdit.pick !== 'face' || meshEdit.faces.size !== 2) {
    toast('桥接：在面模式下 Shift 选两个面')
    return
  }
  const obj = meshTarget()
  if (obj?.mesh === undefined) return
  const mesh = obj.mesh
  const [first, second] = [...meshEdit.faces]
  const faceA = mesh.faces[first]
  const faceB = mesh.faces[second]
  if (faceA === undefined || faceB === undefined) return
  if (faceA.length !== faceB.length) {
    toast('桥接：两个面的顶点数要相同')
    return
  }
  const inA = new Set(faceA)
  if (faceB.some(vertexIndex => inA.has(vertexIndex))) {
    toast('桥接：两个面不能共用顶点')
    return
  }
  const count = faceA.length
  const reversed = [...faceB].reverse()
  const squaredDistance = (a, b) => {
    const va = mesh.vertices[a]
    const vb = mesh.vertices[b]
    return (va[0] - vb[0]) ** 2 + (va[1] - vb[1]) ** 2 + (va[2] - vb[2]) ** 2
  }
  let offset = 0
  let best = Number.POSITIVE_INFINITY
  for (let candidate = 0; candidate < count; candidate += 1) {
    let score = 0
    for (let index = 0; index < count; index += 1) {
      score += squaredDistance(faceA[index], reversed[(index + candidate) % count])
    }
    if (score < best) {
      best = score
      offset = candidate
    }
  }
  const existingEdges = new Set()
  for (const face of mesh.faces) {
    for (let index = 0; index < face.length; index += 1) {
      existingEdges.add(edgeKey(face[index], face[(index + 1) % face.length]))
    }
  }
  const sides = []
  for (let index = 0; index < count; index += 1) {
    const a0 = faceA[index]
    const a1 = faceA[(index + 1) % count]
    const b0 = reversed[(index + offset) % count]
    const b1 = reversed[(index + offset + 1) % count]
    if (existingEdges.has(edgeKey(a0, b0)) || existingEdges.has(edgeKey(a1, b1))) {
      toast('桥接：两个面已经被现有侧面连在一起，会生成重复面')
      return
    }
    sides.push([a0, b0, b1, a1])
  }
  mesh.faces = mesh.faces.filter((_, faceIndex) => faceIndex !== first && faceIndex !== second)
  const added = []
  for (const face of sides) {
    mesh.faces.push(face)
    added.push(mesh.faces.length - 1)
  }
  updateObjectGeometry(obj)
  meshEdit.faces = new Set(added)
  meshEdit.edges = new Set()
  meshEdit.vertices = new Set()
  meshEdit.pick = 'face'
  updatePickButtons('face')
  updateMeshHelpers()
  updateMeshPivot()
  renderMeshInspector()
  updateMeshUI()
  commitHistory()
  scheduleSave()
  toast('已桥接两个面')
}

function renderMeshInspector() {
  const inspector = $('#inspector')
  const empty = $('#inspector-empty')
  if (inspector === null || empty === null) return
  inspector.hidden = false
  empty.hidden = true
  refs = {}
  inspector.replaceChildren()
  const obj = meshTarget()
  if (obj === undefined) return
  const head = el('div', { className: 'inspector-head' })
  head.append(dot(obj.material?.color ?? '#94a3b8', obj.kind))
  head.append(el('b', { text: obj.name }))
  head.append(el('span', { className: 'mesh-badge', text: '网格' }))
  inspector.append(head)
  const info = el('div', { className: 'group' })
  info.append(el('h4', { text: '选区' }))
  const count = activeSelection().size
  const unit = meshEdit?.pick === 'face' ? '个面' : meshEdit?.pick === 'edge' ? '条边' : '个点'
  info.append(el('p', { className: 'empty-note', text: count === 0 ? '还没选' : `已选 ${String(count)} ${unit} · ${String(meshVertexIndices().length)} 个点` }))
  info.append(el('p', { className: 'empty-note', text: 'Shift 点选多选；拖 gizmo 移动、旋转或缩放选区。' }))
  info.append(el('p', { className: 'empty-note', text: '面：挤出 / 内插 / 面倒角 / 细分；两块面可桥接。' }))
  info.append(el('p', { className: 'empty-note', text: '边：倒角（选不相邻的边）/ 环切（闭合四边面环）。' }))
  inspector.append(info)
  const exit = el('button', { className: 'btn', text: '退出网格编辑' })
  exit.addEventListener('click', exitMeshMode)
  inspector.append(exit)
}

/* ---------- history ---------- */

function serialize() {
  return JSON.stringify({
    objects: state.objects.map(obj => {
      const { ...rest } = obj
      return rest
    }),
    lights: state.lights,
    background: state.background,
    grid: state.grid,
  })
}

function serializeForDisk() {
  const data = JSON.parse(serialize())
  data.objects = data.objects.filter(obj => obj.kind !== 'model')
  return JSON.stringify(data)
}

function commitHistory() {
  const snap = serialize()
  if (history[historyIndex] === snap) return
  history = history.slice(0, historyIndex + 1)
  history.push(snap)
  historyIndex = history.length - 1
  if (history.length > 80) {
    history.shift()
    historyIndex -= 1
  }
  updateHistoryButtons()
}

function undo() {
  if (historyIndex <= 0) return
  historyIndex -= 1
  applySnapshot(history[historyIndex])
}

function redo() {
  if (historyIndex >= history.length - 1) return
  historyIndex += 1
  applySnapshot(history[historyIndex])
}

function applySnapshot(snap) {
  if (meshEdit !== null) exitMeshMode()
  const previous = selected
  const data = JSON.parse(snap)
  state.objects = data.objects
  state.lights = data.lights
  state.background = data.background
  state.grid = data.grid
  selected = previous !== null && (previous.type === 'object'
    ? state.objects.some(obj => obj.id === previous.id)
    : state.lights.some(light => light.id === previous.id))
    ? previous
    : null
  rebuildAll()
  scheduleSave()
  toast('已撤销/重做')
}

function updateHistoryButtons() {
  const undoButton = $('#undo')
  const redoButton = $('#redo')
  if (undoButton !== null) undoButton.disabled = historyIndex <= 0
  if (redoButton !== null) redoButton.disabled = historyIndex >= history.length - 1
}

/* ---------- persistence ---------- */

/** The host frame injected into an HTML module; undefined in a standalone file. */
function moduleFrame() {
  const frame = window.NOVEN_FRAME
  if (frame === undefined || frame === null || typeof frame !== 'object') return undefined
  return frame
}

/** The card bridge, present only when the editor runs as a module. */
function cardBridge() {
  const frame = moduleFrame()
  if (frame === undefined) return undefined
  if (typeof frame.cardWrite !== 'function') return undefined
  if (typeof frame.moduleId !== 'string' || frame.moduleId === '') return undefined
  return frame
}

/** The scene wrapper stored in the module's surface state. */
function sceneState() {
  return {
    version: SCENE_STATE_VERSION,
    kind: 'scene3d',
    scene: JSON.parse(serializeForDisk()),
  }
}

function applySceneState(payload) {
  if (payload === null || typeof payload !== 'object') return false
  if (payload.version !== SCENE_STATE_VERSION || payload.kind !== 'scene3d') return false
  const scene = payload.scene
  if (scene === null || typeof scene !== 'object') return false
  if (!Array.isArray(scene.objects) || !Array.isArray(scene.lights)) return false
  state.objects = scene.objects
  state.lights = scene.lights
  state.background = typeof scene.background === 'string' ? scene.background : '#eef2ee'
  state.grid = scene.grid !== false
  return true
}

function updateSaveState(value) {
  const node = $('#saveState')
  if (node === null) return
  if (cardBridge() === undefined) {
    node.hidden = true
    return
  }
  node.hidden = false
  node.dataset.state = value
  node.textContent = value === 'saved' ? '已存入卡'
    : value === 'saving' ? '保存中…'
      : value === 'dirty' ? '未保存'
        : value === 'conflict' ? '需刷新'
          : value === 'error' ? '保存失败' : ''
}

function saveLocal() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(sceneState()))
    return true
  } catch (error) {
    toast(`本地保存失败：${String(error && error.message || error)}`)
    return false
  }
}

function scheduleSave() {
  updateSaveState('dirty')
  if (saveBlocked) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = 0
    persistNow()
  }, 1200)
}

/**
 * Save the scene: into the card through the module bridge, or into
 * localStorage when this file runs standalone. Card saves are serialized so
 * a fast edit cannot advance the revision twice.
 */
function persistNow() {
  if (saveBlocked) {
    toast('场景已在别处改过；刷新后再保存')
    return false
  }
  const frame = cardBridge()
  if (frame === undefined) {
    const ok = saveLocal()
    if (ok) updateSaveState('saved')
    return ok
  }
  if (saveInFlight) {
    saveQueued = true
    return true
  }
  saveInFlight = true
  updateSaveState('saving')
  const payload = sceneState()
  let settled = false
  let timeout = 0
  const finish = result => {
    if (settled) return
    settled = true
    window.removeEventListener('message', onMessage)
    window.clearTimeout(timeout)
    saveInFlight = false
    if (result?.ok === true) {
      surfaceVersion += 1
      updateSaveState('saved')
    } else {
      const message = typeof result?.error === 'string' ? result.error : '未知错误'
      if (message.includes('别处') || message.includes('重新打开')) {
        saveBlocked = true
        updateSaveState('conflict')
      } else {
        updateSaveState('error')
      }
      toast(`保存失败：${message}`)
    }
    if (saveQueued) {
      saveQueued = false
      if (!saveBlocked) scheduleSave()
    }
  }
  const onMessage = event => {
    const data = event.data
    if (data === null || typeof data !== 'object' || data.noven !== 'cardWriteResult') return
    finish(data.result)
  }
  window.addEventListener('message', onMessage)
  timeout = window.setTimeout(() => finish({ ok: false, error: '保存超时' }), 8000)
  try {
    frame.cardWrite({
      kind: 'surface_set_state',
      moduleId: frame.moduleId,
      state: payload,
      expectedVersion: surfaceVersion,
    })
  } catch (error) {
    finish({ ok: false, error: String(error && error.message || error) })
  }
  return true
}

function loadLocal() {
  const frame = moduleFrame()
  if (frame !== undefined) {
    surfaceVersion = typeof frame.surfaceVersion === 'number' ? frame.surfaceVersion : 0
    // A module without injected state starts from the default scene; the old
    // standalone localStorage is not this module's data.
    return frame.surfaceState !== undefined && applySceneState(frame.surfaceState)
  }
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw === null) return false
    const data = JSON.parse(raw)
    if (data !== null && typeof data === 'object' && applySceneState(data)) return true
    if (!Array.isArray(data.objects) || !Array.isArray(data.lights)) return false
    state.objects = data.objects
    state.lights = data.lights
    state.background = typeof data.background === 'string' ? data.background : '#eef2ee'
    state.grid = data.grid !== false
    return true
  } catch {
    return false
  }
}

/* ---------- toast / background / empty ---------- */

function toast(text) {
  const node = $('#toast')
  if (node === null) return
  node.textContent = text
  node.dataset.on = ''
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { delete node.dataset.on }, 2200)
}

function applyBackground() {
  viewport.style.background = `radial-gradient(circle at 50% 22%, #ffffff 0%, ${state.background} 74%)`
}

function updateEmpty() {
  const empty = $('#empty')
  if (empty !== null) empty.hidden = state.objects.length > 0 || previewMode
}

/* ---------- outliner ---------- */

function dot(color, kind) {
  const span = document.createElement('span')
  span.className = 'dot'
  span.style.background = kind === 'model' ? '#9aa6a0' : color
  if (kind === 'model') span.dataset.model = ''
  return span
}

function rowFor(entry, type, color, kind) {
  const row = document.createElement('div')
  row.className = 'row'
  row.dataset.id = entry.id
  row.dataset.type = type
  if (selected !== null && selected.type === type && selected.id === entry.id) row.dataset.on = ''
  const main = document.createElement('button')
  main.type = 'button'
  main.className = 'row-main'
  main.append(dot(color, kind))
  const name = document.createElement('span')
  name.className = 'row-name'
  name.textContent = entry.name
  main.append(name)
  main.addEventListener('click', () => select(type, entry.id))
  row.append(main)
  const eye = document.createElement('button')
  eye.type = 'button'
  eye.className = 'row-icon'
  eye.title = entry.visible === false ? '显示' : '隐藏'
  eye.textContent = entry.visible === false ? '◌' : '◉'
  eye.addEventListener('click', event => {
    event.stopPropagation()
    if (type === 'object') {
      const obj = state.objects.find(candidate => candidate.id === entry.id)
      if (obj !== undefined) obj.visible = obj.visible === false
    } else {
      const light = state.lights.find(candidate => candidate.id === entry.id)
      if (light !== undefined) light.visible = light.visible === false
    }
    rebuildAll()
    scheduleSave()
    commitHistory()
  })
  row.append(eye)
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'row-icon row-remove'
  remove.title = '删除'
  remove.textContent = '×'
  remove.addEventListener('click', event => {
    event.stopPropagation()
    if (type === 'object') removeObject(entry.id)
    else removeLight(entry.id)
  })
  row.append(remove)
  return row
}

function renderOutliner() {
  const objects = $('#outliner')
  const lights = $('#lightlist')
  if (objects === null || lights === null) return
  objects.replaceChildren()
  for (const obj of state.objects) {
    objects.append(rowFor(obj, 'object', obj.material?.color ?? '#94a3b8', obj.kind))
  }
  if (state.objects.length === 0) {
    const note = document.createElement('p')
    note.className = 'empty-note'
    note.textContent = '还没有对象'
    objects.append(note)
  }
  lights.replaceChildren()
  for (const light of state.lights) {
    lights.append(rowFor(light, 'light', light.color, light.kind))
  }
}

/* ---------- inspector ---------- */

let refs = {}

function el(tag, options = {}) {
  const node = document.createElement(tag)
  if (options.className !== undefined) node.className = options.className
  if (options.text !== undefined) node.textContent = options.text
  if (options.type !== undefined) node.type = options.type
  if (options.value !== undefined) node.value = options.value
  if (options.step !== undefined) node.step = options.step
  if (options.min !== undefined) node.min = options.min
  if (options.max !== undefined) node.max = options.max
  if (options.placeholder !== undefined) node.placeholder = options.placeholder
  if (options.title !== undefined) node.title = options.title
  return node
}

function beginEdit() {
  // The post-edit state is committed by endEdit; snapshotting here would
  // record the state before any input has happened.
  editingField = true
}

function endEdit() {
  editingField = false
  commitHistory()
  scheduleSave()
}

function numberInput(value, step, onChange) {
  const input = el('input', { type: 'number', step, value: String(Number(value.toFixed(3))) })
  input.addEventListener('focus', beginEdit)
  input.addEventListener('pointerdown', beginEdit)
  input.addEventListener('input', () => {
    if (input.value === '' || Number.isNaN(Number(input.value))) return
    onChange(Number(input.value))
  })
  input.addEventListener('change', endEdit)
  input.addEventListener('blur', endEdit)
  return input
}

function field(label, control) {
  const wrap = el('label', { className: 'field' })
  wrap.append(el('span', { className: 'field-label', text: label }), control)
  return wrap
}

function colorInput(value, onChange) {
  const input = el('input', { type: 'color', value })
  input.addEventListener('focus', beginEdit)
  input.addEventListener('pointerdown', beginEdit)
  input.addEventListener('input', () => onChange(input.value))
  input.addEventListener('change', endEdit)
  return input
}

function rangeInput(value, min, max, step, onChange) {
  const wrap = el('div', { className: 'range' })
  const input = el('input', { type: 'range', min, max, step, value: String(value) })
  const read = el('b', { text: String(value) })
  input.addEventListener('focus', beginEdit)
  input.addEventListener('pointerdown', beginEdit)
  input.addEventListener('input', () => {
    read.textContent = input.value
    onChange(Number(input.value))
  })
  input.addEventListener('change', endEdit)
  wrap.append(input, read)
  return wrap
}

function transformGroup(title, values, onChange, step = 0.1) {
  const group = el('div', { className: 'group' })
  group.append(el('h4', { text: title }))
  for (let index = 0; index < 3; index += 1) {
    const control = numberInput(values[index], step, value => onChange(index, value))
    const row = field(['X', 'Y', 'Z'][index], control)
    group.append(row)
    refs[`${title}${index}`] = control
  }
  return group
}

function renderInspector() {
  const inspector = $('#inspector')
  const empty = $('#inspector-empty')
  if (inspector === null || empty === null) return
  refs = {}
  if (meshEdit !== null) {
    renderMeshInspector()
    return
  }
  if (selected === null) {
    inspector.hidden = true
    empty.hidden = false
    renderSceneInspector()
    return
  }
  inspector.hidden = false
  empty.hidden = true
  inspector.replaceChildren()
  if (selected.type === 'object') {
    const obj = state.objects.find(candidate => candidate.id === selected.id)
    if (obj === undefined) return
    const head = el('div', { className: 'inspector-head' })
    head.append(dot(obj.material?.color ?? '#94a3b8', obj.kind))
    head.append(el('b', { text: KIND_LABEL[obj.kind] ?? '对象' }))
    inspector.append(head)

    const name = el('input', { type: 'text', value: obj.name })
    name.addEventListener('focus', beginEdit)
    name.addEventListener('input', () => {
      obj.name = name.value
      renderOutliner()
    })
    name.addEventListener('change', endEdit)
    inspector.append(field('名称', name))

    inspector.append(transformGroup('位置', obj.position, (index, value) => {
      obj.position[index] = value
      const node = meshes.get(obj.id)
      if (node !== undefined) node.position[index] = value
      updateSelectionBox()
      scheduleSave()
    }))
    inspector.append(transformGroup('旋转', obj.rotation.map(value => value * DEG), (index, value) => {
      obj.rotation[index] = value * RAD
      const node = meshes.get(obj.id)
      if (node !== undefined) node.rotation[index] = value * RAD
      updateSelectionBox()
      scheduleSave()
    }, 1))
    inspector.append(transformGroup('缩放', obj.scale, (index, value) => {
      obj.scale[index] = value || 0.001
      const node = meshes.get(obj.id)
      if (node !== undefined) node.scale[index] = value || 0.001
      updateSelectionBox()
      scheduleSave()
    }))

    if (obj.kind !== 'model') {
      const material = el('div', { className: 'group' })
      material.append(el('h4', { text: '材质' }))
      const color = colorInput(obj.material.color, value => {
        obj.material.color = value
        const node = meshes.get(obj.id)
        if (node !== undefined && node.material !== undefined) node.material.color.set(value)
        renderOutliner()
        scheduleSave()
      })
      refs.color = color
      material.append(field('颜色', color))
      material.append(field('粗糙度', rangeInput(obj.material.roughness, 0, 1, 0.01, value => {
        obj.material.roughness = value
        const node = meshes.get(obj.id)
        if (node !== undefined && node.material !== undefined) node.material.roughness = value
        scheduleSave()
      })))
      material.append(field('金属度', rangeInput(obj.material.metalness, 0, 1, 0.01, value => {
        obj.material.metalness = value
        const node = meshes.get(obj.id)
        if (node !== undefined && node.material !== undefined) node.material.metalness = value
        scheduleSave()
      })))
      material.append(field('透明度', rangeInput(obj.material.opacity, 0.1, 1, 0.01, value => {
        obj.material.opacity = value
        const node = meshes.get(obj.id)
        if (node !== undefined && node.material !== undefined) {
          node.material.opacity = value
          node.material.transparent = value < 1
        }
        scheduleSave()
      })))
      inspector.append(material)
    } else {
      inspector.append(el('p', { className: 'model-note', text: '模型仅本次会话保留；刷新后需重新导入。' }))
    }

    const actions = el('div', { className: 'actions' })
    const duplicate = el('button', { className: 'btn', text: '复制' })
    duplicate.addEventListener('click', () => duplicateObject(obj.id))
    const remove = el('button', { className: 'btn danger', text: '删除' })
    remove.addEventListener('click', () => removeObject(obj.id))
    actions.append(duplicate, remove)
    inspector.append(actions)
    return
  }

  const light = state.lights.find(candidate => candidate.id === selected.id)
  if (light === undefined) return
  const head = el('div', { className: 'inspector-head' })
  head.append(dot(light.color, light.kind))
  head.append(el('b', { text: light.kind === 'hemisphere' ? '环境光' : light.kind === 'point' ? '点光' : '方向光' }))
  inspector.append(head)
  const name = el('input', { type: 'text', value: light.name })
  name.addEventListener('focus', beginEdit)
  name.addEventListener('input', () => { light.name = name.value; renderOutliner() })
  name.addEventListener('change', endEdit)
  inspector.append(field('名称', name))
  const color = colorInput(light.color, value => {
    light.color = value
    rebuildLights()
    select('light', light.id)
    scheduleSave()
  })
  refs.color = color
  inspector.append(field('颜色', color))
  inspector.append(field('强度', rangeInput(light.intensity, 0, light.kind === 'point' ? 30 : 8, 0.1, value => {
    light.intensity = value
    const node = lightNodes.get(light.id)?.node
    if (node !== undefined) node.intensity = value
    scheduleSave()
  })))
  if (light.kind !== 'hemisphere') {
    inspector.append(transformGroup('位置', light.position, (index, value) => {
      light.position[index] = value
      const node = lightNodes.get(light.id)?.node
      if (node !== undefined) node.position[index] = value
      updateSelectionBox()
      scheduleSave()
    }))
  }
  const remove = el('button', { className: 'btn danger', text: '删除灯光' })
  remove.addEventListener('click', () => removeLight(light.id))
  inspector.append(remove)
}

function renderSceneInspector() {
  const empty = $('#inspector-empty')
  if (empty === null) return
  empty.replaceChildren()
  empty.append(el('p', { className: 'empty-note', text: '选中一个对象或灯光，或直接开始搭。' }))
  const bg = el('div', { className: 'group' })
  bg.append(el('h4', { text: '场景' }))
  bg.append(field('背景', colorInput(state.background, value => {
    state.background = value
    applyBackground()
    scheduleSave()
  })))
  const gridToggle = el('label', { className: 'check' })
  const gridInput = el('input', { type: 'checkbox' })
  gridInput.checked = state.grid
  gridInput.addEventListener('change', () => {
    state.grid = gridInput.checked
    grid.visible = state.grid
    scheduleSave()
    commitHistory()
  })
  gridToggle.append(gridInput, el('span', { text: '显示网格' }))
  bg.append(gridToggle)
  empty.append(bg)

  const lights = el('div', { className: 'group' })
  lights.append(el('h4', { text: '添加灯光' }))
  const addDirectional = el('button', { className: 'btn', text: '＋ 方向光' })
  addDirectional.addEventListener('click', () => addLight('directional'))
  const addPoint = el('button', { className: 'btn', text: '＋ 点光' })
  addPoint.addEventListener('click', () => addLight('point'))
  const lightRow = el('div', { className: 'actions' })
  lightRow.append(addDirectional, addPoint)
  lights.append(lightRow)
  empty.append(lights)

  const sceneActions = el('div', { className: 'group' })
  sceneActions.append(el('h4', { text: '视图' }))
  const reset = el('button', { className: 'btn', text: '重置相机' })
  reset.addEventListener('click', () => {
    camera.position.fromArray(cameraDefault.position)
    orbit.target.fromArray(cameraDefault.target)
    orbit.update()
  })
  const clear = el('button', { className: 'btn danger', text: '清空场景' })
  clear.addEventListener('click', clearScene)
  const row = el('div', { className: 'actions' })
  row.append(reset, clear)
  sceneActions.append(row)
  empty.append(sceneActions)
}

function syncInspectorValues() {
  if (selected === null) return
  if (selected.type === 'object') {
    const obj = state.objects.find(candidate => candidate.id === selected.id)
    if (obj === undefined) return
    for (let index = 0; index < 3; index += 1) {
      if (refs[`位置${index}`] !== undefined) refs[`位置${index}`].value = String(Number(obj.position[index].toFixed(3)))
      if (refs[`旋转${index}`] !== undefined) refs[`旋转${index}`].value = String(Number((obj.rotation[index] * DEG).toFixed(3)))
      if (refs[`缩放${index}`] !== undefined) refs[`缩放${index}`].value = String(Number(obj.scale[index].toFixed(3)))
    }
    if (refs.color !== undefined) refs.color.value = obj.material.color
  } else {
    const light = state.lights.find(candidate => candidate.id === selected.id)
    if (light === undefined) return
    for (let index = 0; index < 3; index += 1) {
      if (refs[`位置${index}`] !== undefined) refs[`位置${index}`].value = String(Number((light.position?.[index] ?? 0).toFixed(3)))
    }
    if (refs.color !== undefined) refs.color.value = light.color
  }
}

/* ---------- object operations ---------- */

function nextName(kind) {
  const label = KIND_LABEL[kind] ?? '对象'
  const count = state.objects.filter(obj => obj.kind === kind).length + 1
  return `${label} ${count}`
}

function defaultPosition(kind, count) {
  const offsetX = count === 0 ? 0 : (count % 3 - 1) * 1.5
  const offsetZ = count === 0 ? 0 : -Math.floor(count / 3) * 1.5
  const y = kind === 'plane' ? 0
    : kind === 'capsule' ? 0.72
      : kind === 'cylinder' || kind === 'cone' ? 0.6
        : 0.5
  return [offsetX, y, offsetZ]
}

function objectData(kind, spec = {}) {
  const mesh = MESH_KINDS.has(kind) ? primitiveMesh(kind) : undefined
  return {
    id: uid(),
    name: spec.name ?? nextName(kind),
    kind,
    position: spec.position ?? defaultPosition(kind, state.objects.length),
    rotation: spec.rotation ?? [0, 0, 0],
    scale: spec.scale ?? [1, 1, 1],
    material: {
      color: spec.color ?? PALETTE[state.objects.length % PALETTE.length],
      roughness: spec.roughness ?? 0.62,
      metalness: spec.metalness ?? 0.05,
      opacity: spec.opacity ?? 1,
    },
    visible: true,
    ...(mesh === undefined ? {} : { mesh }),
  }
}

function addObject(kind, options = {}) {
  if (meshEdit !== null) exitMeshMode()
  const obj = objectData(kind, options)
  state.objects.push(obj)
  rebuildAll()
  select('object', obj.id)
  scheduleSave()
  commitHistory()
  toast(`已添加${KIND_LABEL[kind] ?? '对象'}`)
  return obj
}

function duplicateObject(id) {
  if (meshEdit !== null) exitMeshMode()
  const source = state.objects.find(obj => obj.id === id)
  if (source === undefined) return
  const copy = JSON.parse(JSON.stringify(source))
  copy.id = uid()
  copy.name = `${source.name} 副本`
  copy.position = [source.position[0] + 0.45, source.position[1], source.position[2] + 0.35]
  if (source.kind === 'model') {
    const cached = modelCache.get(source.id)
    if (cached !== undefined) modelCache.set(copy.id, cached.clone(true))
  }
  state.objects.push(copy)
  rebuildAll()
  select('object', copy.id)
  scheduleSave()
  commitHistory()
}

function removeObject(id) {
  if (meshEdit !== null && meshEdit.objectId === id) exitMeshMode()
  const index = state.objects.findIndex(obj => obj.id === id)
  if (index < 0) return
  state.objects.splice(index, 1)
  if (selected !== null && selected.type === 'object' && selected.id === id) selected = null
  rebuildAll()
  scheduleSave()
  commitHistory()
}

function addLight(kind) {
  const count = state.lights.filter(light => light.kind === kind).length + 1
  const light = {
    id: uid(),
    name: kind === 'point' ? `点光 ${count}` : kind === 'directional' ? `方向光 ${count}` : `环境光 ${count}`,
    kind,
    color: '#ffffff',
    intensity: kind === 'point' ? 8 : 2.2,
    position: kind === 'point' ? [-2.5, 2.2, 2.5] : [4, 6, 4],
    visible: true,
  }
  state.lights.push(light)
  rebuildAll()
  select('light', light.id)
  scheduleSave()
  commitHistory()
}

function removeLight(id) {
  const index = state.lights.findIndex(light => light.id === id)
  if (index < 0) return
  state.lights.splice(index, 1)
  if (selected !== null && selected.type === 'light' && selected.id === id) selected = null
  rebuildAll()
  scheduleSave()
  commitHistory()
}

function clearScene() {
  if (meshEdit !== null) exitMeshMode()
  state.objects = []
  state.lights = []
  selected = null
  rebuildAll()
  scheduleSave()
  commitHistory()
  toast('场景已清空')
}

/* ---------- import ---------- */

const fileInput = $('#file')
$('#import').addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  if (file === undefined) return
  const url = URL.createObjectURL(file)
  try {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    const raw = gltf.scene
    const box = new THREE.Box3().setFromObject(raw)
    const size = box.getSize(new THREE.Vector3())
    const max = Math.max(size.x, size.y, size.z, 0.001)
    const scale = 2.2 / max
    raw.scale.setScalar(scale)
    raw.position.set(
      -((box.min.x + box.max.x) / 2) * scale,
      -box.min.y * scale,
      -((box.min.z + box.max.z) / 2) * scale,
    )
    raw.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    const wrapper = new THREE.Group()
    wrapper.add(raw)
    const id = uid()
    modelCache.set(id, wrapper)
    const obj = {
      id,
      name: file.name.replace(/\.(glb|gltf)$/i, '') || '模型',
      kind: 'model',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      material: { color: '#94a3b8', roughness: 0.6, metalness: 0.05, opacity: 1 },
      visible: true,
    }
    state.objects.push(obj)
    rebuildAll()
    select('object', id)
    scheduleSave()
    commitHistory()
    toast('模型已导入；卡内保存会跳过模型，仅本次会话可见')
  } catch (error) {
    toast(`模型加载失败：${String(error && error.message || error).slice(0, 80)}`)
  } finally {
    URL.revokeObjectURL(url)
    fileInput.value = ''
  }
})

/* ---------- toolbar ---------- */

function setMode(next) {
  mode = next
  transform.setMode(mode)
  for (const button of document.querySelectorAll('[data-mode]')) {
    if (button.dataset.mode === mode) button.dataset.on = ''
    else delete button.dataset.on
  }
}
for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => setMode(button.dataset.mode))
}
function closeDrawers() {
  document.body.classList.remove('left-open', 'right-open')
}
$('#openLeft').addEventListener('click', () => {
  document.body.classList.toggle('left-open')
  document.body.classList.remove('right-open')
})
$('#openRight').addEventListener('click', () => {
  document.body.classList.toggle('right-open')
  document.body.classList.remove('left-open')
})
$('#scrim').addEventListener('click', closeDrawers)
$('#undo').addEventListener('click', undo)
$('#redo').addEventListener('click', redo)
$('#save').addEventListener('click', () => {
  window.clearTimeout(saveTimer)
  saveTimer = 0
  if (cardBridge() !== undefined) {
    persistNow()
    return
  }
  toast(persistNow() ? '已保存到本地' : '本地保存不可用')
})
$('#preview').addEventListener('click', enterPreview)
$('#exitPreview').addEventListener('click', exitPreview)

function enterPreview() {
  if (meshEdit !== null) exitMeshMode()
  previewMode = true
  transform.detach()
  selectionBox.visible = false
  grid.visible = false
  updateLightMarkers()
  document.body.classList.add('preview')
  updateEmpty()
}
function exitPreview() {
  previewMode = false
  document.body.classList.remove('preview')
  grid.visible = state.grid
  if (selected !== null) select(selected.type, selected.id)
  else updateLightMarkers()
  updateEmpty()
}

/* ---------- add buttons / edit mode / empty ---------- */

for (const button of document.querySelectorAll('[data-add]')) {
  button.addEventListener('click', () => { addObject(button.dataset.add); closeDrawers() })
}
$('#addLightDirectional').addEventListener('click', () => addLight('directional'))
$('#addLightPoint').addEventListener('click', () => addLight('point'))
$('#objectMode').addEventListener('click', exitMeshMode)
$('#meshMode').addEventListener('click', enterMeshMode)
for (const button of document.querySelectorAll('[data-pick]')) {
  button.addEventListener('click', () => setMeshPick(button.dataset.pick))
}
$('#extrude').addEventListener('click', extrudeSelectedFaces)
$('#inset').addEventListener('click', () => insetSelectedFaces(0))
$('#faceBevel').addEventListener('click', () => insetSelectedFaces(0.12))
$('#subdivide').addEventListener('click', subdivideSelectedFaces)
$('#bridge').addEventListener('click', bridgeSelectedFaces)
$('#edgeBevel').addEventListener('click', bevelSelectedEdges)
$('#loopCut').addEventListener('click', loopCutSelectedEdge)

/* ---------- pointer selection ---------- */

let down = null
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return
  down = { x: event.clientX, y: event.clientY, gizmo: transform.dragging }
})
canvas.addEventListener('pointerup', event => {
  if (down === null) return
  const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
  const gizmo = down.gizmo || transform.dragging
  down = null
  if (moved > 4 || gizmo || previewMode) return
  const rect = canvas.getBoundingClientRect()
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  if (meshEdit !== null) {
    pickMeshElement(mouse, event.shiftKey)
    return
  }
  raycaster.setFromCamera(mouse, camera)
  const hits = raycaster.intersectObjects(objectGroup.children, true)
  for (const hit of hits) {
    let node = hit.object
    while (node !== null && node.userData.objectId === undefined) node = node.parent
    if (node !== null && node.userData.objectId !== undefined) {
      select('object', node.userData.objectId)
      return
    }
  }
  select(null)
})

transform.addEventListener('dragging-changed', event => {
  orbit.enabled = !event.value
  if (meshEdit !== null) {
    if (event.value) {
      meshPivot.updateMatrix()
      meshDragStartMatrix = meshPivot.matrix.clone()
      meshDragStartVertices = meshVertexIndices().map(index =>
        new THREE.Vector3(...meshTarget().mesh.vertices[index]))
    } else {
      commitHistory()
      scheduleSave()
      meshDragStartMatrix = null
      meshDragStartVertices = []
      updateMeshPivot()
    }
    return
  }
  if (!event.value) {
    commitHistory()
    scheduleSave()
  }
})
transform.addEventListener('objectChange', () => {
  if (meshEdit !== null) syncMeshFromPivot()
  else syncFromNode()
})

/* ---------- keyboard ---------- */

window.addEventListener('keydown', event => {
  const target = event.target
  if (target instanceof Element && target.closest('input, textarea, [contenteditable]')) return
  if (event.key === 'Escape') {
    if (previewMode) { exitPreview(); return }
    if (meshEdit !== null) { exitMeshMode(); return }
    if (selected !== null) { select(null); return }
  }
  if (previewMode) return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return
  }
  if (event.key.toLowerCase() === 'w') { setMode('translate'); return }
  if (event.key.toLowerCase() === 'e') { setMode('rotate'); return }
  if (event.key.toLowerCase() === 'r') { setMode('scale'); return }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (meshEdit !== null || selected === null) return
    event.preventDefault()
    if (selected.type === 'object') removeObject(selected.id)
    else removeLight(selected.id)
  }
})

/* ---------- boot ---------- */

function loadInitialScene() {
  state.objects = []
  state.lights = [
    { id: uid(), name: '主光', kind: 'directional', color: '#fff4dc', intensity: 2.4, position: [4, 6, 4], visible: true },
    { id: uid(), name: '环境光', kind: 'hemisphere', color: '#ffffff', intensity: 0.7, position: [0, 4, 0], visible: true },
  ]
  state.background = '#eef2ec'
  state.grid = true
  const cube = objectData('box', { name: '方块 1', position: [0, 0.5, 0], color: '#d8b98a' })
  state.objects.push(cube)
  cameraDefault = { position: [3.2, 2.4, 3.8], target: [0, 0.5, 0] }
  camera.position.fromArray(cameraDefault.position)
  orbit.target.fromArray(cameraDefault.target)
  orbit.update()
  selected = null
  rebuildAll()
  select('object', cube.id)
  history = [serialize()]
  historyIndex = 0
  updateHistoryButtons()
  updateEmpty()
  updateMeshUI()
  if (cardBridge() === undefined) saveLocal()
  else updateSaveState('dirty')
}

if (loadLocal()) {
  rebuildAll()
  history = [serialize()]
  historyIndex = 0
  updateHistoryButtons()
  updateEmpty()
  updateMeshUI()
  updateSaveState('saved')
} else {
  loadInitialScene()
}
setMode('translate')
updateHistoryButtons()
updateMeshUI()

// Expose a tiny debug handle for inspection; harmless in a standalone draft.
window.__draft = {
  state, addObject, select, undo, redo, clearScene, refresh: rebuildAll,
  enterMeshMode, exitMeshMode, extrudeSelectedFaces, insetSelectedFaces, subdivideSelectedFaces,
  bevelSelectedEdges, loopCutSelectedEdge, bridgeSelectedFaces,
  setMeshPick, selectMesh,
  selectFace(index) { if (meshEdit !== null) setMeshPick('face'); selectMesh(index) },
  get selected() { return selected },
  get meshEdit() { return meshEdit },
  projectVertices() {
    const obj = state.objects.find(candidate => candidate.id === meshEdit?.objectId)
    if (obj?.mesh === undefined) return []
    const rect = canvas.getBoundingClientRect()
    return obj.mesh.vertices.map(vertex => {
      const projected = new THREE.Vector3(vertex[0], vertex[1], vertex[2]).project(camera)
      return {
        x: rect.left + ((projected.x + 1) / 2) * rect.width,
        y: rect.top + ((-projected.y + 1) / 2) * rect.height,
      }
    })
  },
  get pivotScreen() {
    const rect = canvas.getBoundingClientRect()
    const projected = meshPivot.position.clone().project(camera)
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((-projected.y + 1) / 2) * rect.height,
    }
  },
}
