import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { calibrateAvatarPoses, retargetMixamoClipToVRM } from './mixamoVRMRigMap.js'

/**
 * Per-character config.
 * - headHeight: world height (m) of the humanoid head bone after normalization. Using the head bone
 *   (rather than the bounding box) keeps both characters the same size regardless of hair/ahoge.
 * - tintMaterials: fixes for untextured materials in the source asset (e.g. Miku's `material_3.001` hair).
 * - toon: convert plain PBR materials to cel-shaded toon materials to match MToon characters.
 * - useMixamoClips: false when the model's raw rig already ships in a pre-baked A-pose.
 */
export const CHARACTER_CATALOG = {
  miku: {
    id: 'miku',
    name: 'Hatsune Miku',
    subtitle: 'Virtual Diva • 01',
    accentColor: '#39c5bb',
    secondaryColor: '#1f2937',
    modelUrl: '/models/miku.vrm',
    publicPath: '/public/models/miku.vrm',
    headHeight: 1.36,
    tintMaterials: { material_3: '#39c5bb' },
    toon: true,
    useMixamoClips: true,
  },
  teto: {
    id: 'teto',
    idCode: '0401',
    name: 'Kasane Teto',
    subtitle: 'Twin-Drill Diva • 0401',
    accentColor: '#e63946',
    secondaryColor: '#2b2d42',
    modelUrl: '/models/teto.vrm',
    publicPath: '/public/models/teto.vrm',
    headHeight: 1.36,
    tintMaterials: null,
    toon: false,
    useMixamoClips: true,
  },
}

export const ANIMATION_LIBRARY_URL = '/models/animations.glb'

const missingModelFiles = new Set()
const missingListeners = new Set()

export function getMissingModelFiles() {
  return Array.from(missingModelFiles)
}

export function onMissingModelsChange(listener) {
  missingListeners.add(listener)
  return () => missingListeners.delete(listener)
}

function notifyMissingModels() {
  const current = getMissingModelFiles()
  missingListeners.forEach((fn) => {
    try {
      fn(current)
    } catch {
      // ignore listener error
    }
  })
}

function markShared(...items) {
  items.forEach((item) => {
    item.userData.isShared = true
  })
}

// Shared primitive geometries / materials for placeholders & props (allocated once, never per frame)
let sharedPrimitives = null
function getSharedPrimitives() {
  if (!sharedPrimitives) {
    sharedPrimitives = {
      torsoGeo: new THREE.CapsuleGeometry(0.18, 0.42, 8, 16),
      headGeo: new THREE.SphereGeometry(0.17, 16, 16),
      limbGeo: new THREE.CapsuleGeometry(0.055, 0.26, 6, 12),
      hairGeo: new THREE.ConeGeometry(0.09, 0.55, 10),
      jawGeo: new THREE.BoxGeometry(0.07, 0.025, 0.04),
      micHandleGeo: new THREE.CylinderGeometry(0.015, 0.011, 0.17, 12),
      micHeadGeo: new THREE.SphereGeometry(0.028, 14, 12),
      stickGeo: new THREE.CylinderGeometry(0.014, 0.014, 0.29, 8),
      micHandleMat: new THREE.MeshStandardMaterial({ color: 0x1b1e26, roughness: 0.35, metalness: 0.8 }),
      micHeadMat: new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.3, metalness: 0.9 }),
      stickMats: {
        miku: new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ff5ea').multiplyScalar(1.6), toneMapped: false }),
        teto: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4d6d').multiplyScalar(1.6), toneMapped: false }),
      },
    }
    const p = sharedPrimitives
    markShared(
      p.torsoGeo, p.headGeo, p.limbGeo, p.hairGeo, p.jawGeo, p.micHandleGeo, p.micHeadGeo, p.stickGeo,
      p.micHandleMat, p.micHeadMat, p.stickMats.miku, p.stickMats.teto,
    )
  }
  return sharedPrimitives
}

let toonGradient = null
function getToonGradient() {
  if (!toonGradient) {
    const data = new Uint8Array([125, 125, 125, 255, 198, 198, 198, 255, 255, 255, 255, 255])
    toonGradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
    toonGradient.minFilter = THREE.NearestFilter
    toonGradient.magFilter = THREE.NearestFilter
    toonGradient.generateMipmaps = false
    toonGradient.needsUpdate = true
    toonGradient.userData.isShared = true
  }
  return toonGradient
}

function createMicrophoneProp() {
  const prims = getSharedPrimitives()
  const micGroup = new THREE.Group()
  micGroup.name = 'KaraokeMicProp'
  const handle = new THREE.Mesh(prims.micHandleGeo, prims.micHandleMat)
  const grill = new THREE.Mesh(prims.micHeadGeo, prims.micHeadMat)
  grill.position.y = 0.092
  micGroup.add(handle, grill)
  return micGroup
}

function createGlowstickProp(characterKey) {
  const prims = getSharedPrimitives()
  const stick = new THREE.Mesh(prims.stickGeo, prims.stickMats[characterKey] || prims.stickMats.miku)
  stick.name = 'PenlightProp'
  return stick
}

function baseRecord(overrides) {
  return {
    vrm: null,
    mixer: null,
    actions: null,
    poses: null,
    props: {},
    isVRM0: false,
    animationState: 'idle',
    singIntensity: 0,
    cheerIntensity: 0,
    spawn: 1,
    beatTime: 0,
    blinkTimer: 2 + Math.random() * 3,
    blinkValue: 0,
    phaseOffset: Math.random() * 10,
    basePosition: new THREE.Vector3(0, 0, 0),
    baseRotationY: 0,
    headAnchor: null,
    ...overrides,
  }
}

/**
 * Stubs a capsule + sphere head articulated humanoid primitive when a .vrm file is missing.
 */
export function createPlaceholderAvatar(characterKey = 'miku') {
  const meta = CHARACTER_CATALOG[characterKey] || CHARACTER_CATALOG.miku
  const prims = getSharedPrimitives()

  const rootGroup = new THREE.Group()
  rootGroup.name = `Placeholder_${meta.id}`

  const bodyMat = new THREE.MeshToonMaterial({ color: meta.accentColor, gradientMap: getToonGradient() })
  const skinMat = new THREE.MeshToonMaterial({ color: 0xffe5d9, gradientMap: getToonGradient() })
  const darkMat = new THREE.MeshToonMaterial({ color: meta.secondaryColor, gradientMap: getToonGradient() })

  const node = (parent, x, y, z) => {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    parent.add(g)
    return g
  }
  const mesh = (parent, geo, mat, y = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.y = y
    parent.add(m)
    return m
  }

  const hips = node(rootGroup, 0, 0.85, 0)
  const spine = node(hips, 0, 0, 0)
  const chest = node(spine, 0, 0.22, 0)
  mesh(chest, prims.torsoGeo, bodyMat, 0.02)
  const head = node(chest, 0, 0.44, 0)
  mesh(head, prims.headGeo, skinMat)
  const jaw = node(head, 0, -0.06, 0.15)
  mesh(jaw, prims.jawGeo, darkMat)

  const hairLeft = mesh(head, prims.hairGeo, bodyMat)
  hairLeft.position.set(0.22, -0.12, -0.04)
  hairLeft.rotation.z = characterKey === 'teto' ? 0.45 : 0.25
  const hairRight = mesh(head, prims.hairGeo, bodyMat)
  hairRight.position.set(-0.22, -0.12, -0.04)
  hairRight.rotation.z = characterKey === 'teto' ? -0.45 : -0.25

  const leftUpperArm = node(chest, 0.24, 0.2, 0)
  mesh(leftUpperArm, prims.limbGeo, darkMat, -0.14)
  const leftLowerArm = node(leftUpperArm, 0, -0.28, 0)
  mesh(leftLowerArm, prims.limbGeo, skinMat, -0.14)
  const rightUpperArm = node(chest, -0.24, 0.2, 0)
  mesh(rightUpperArm, prims.limbGeo, darkMat, -0.14)
  const rightLowerArm = node(rightUpperArm, 0, -0.28, 0)
  mesh(rightLowerArm, prims.limbGeo, skinMat, -0.14)

  const mic = createMicrophoneProp()
  mic.position.set(0, -0.26, 0.05)
  mic.rotation.x = Math.PI * 0.35
  mic.visible = false
  rightLowerArm.add(mic)

  const leftUpperLeg = node(hips, 0.1, -0.1, 0)
  mesh(leftUpperLeg, prims.limbGeo, darkMat, -0.2)
  const leftLowerLeg = node(leftUpperLeg, 0, -0.38, 0)
  mesh(leftLowerLeg, prims.limbGeo, bodyMat, -0.18)
  const rightUpperLeg = node(hips, -0.1, -0.1, 0)
  mesh(rightUpperLeg, prims.limbGeo, darkMat, -0.2)
  const rightLowerLeg = node(rightUpperLeg, 0, -0.38, 0)
  mesh(rightLowerLeg, prims.limbGeo, bodyMat, -0.18)

  const bones = {
    hips, spine, chest, head, jaw,
    leftUpperArm, leftLowerArm, rightUpperArm, rightLowerArm,
    leftUpperLeg, leftLowerLeg, rightUpperLeg, rightLowerLeg,
  }
  const restQuats = {}
  Object.entries(bones).forEach(([k, n]) => {
    restQuats[k] = n.quaternion.clone()
  })

  return baseRecord({
    character: meta.id,
    scene: rootGroup,
    rootGroup,
    bones,
    restQuats,
    armSign: 1,
    isPlaceholder: true,
    missingFile: meta.publicPath,
    props: { mic },
    headAnchor: head,
  })
}

let sharedLoader = null
function getLoader() {
  if (!sharedLoader) {
    sharedLoader = new GLTFLoader()
    sharedLoader.register((parser) => new VRMLoaderPlugin(parser))
  }
  return sharedLoader
}

const progressListeners = new Set()

/** Subscribe to byte-level download progress of avatar/animation assets: fn({ url, loaded, total }). */
export function onModelProgress(listener) {
  progressListeners.add(listener)
  return () => progressListeners.delete(listener)
}

async function readWithProgress(res, url) {
  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body || !total || progressListeners.size === 0) return res.arrayBuffer()
  const reader = res.body.getReader()
  const out = new Uint8Array(total)
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (loaded + value.length > out.length) return new Blob([out.subarray(0, loaded), value]).arrayBuffer()
    out.set(value, loaded)
    loaded += value.length
    progressListeners.forEach((fn) => fn({ url, loaded, total }))
  }
  return loaded === total ? out.buffer : out.buffer.slice(0, loaded)
}
// Raw file bytes are downloaded once per URL and re-parsed per avatar instance.
const bufferCache = new Map()
function fetchModelBuffer(url) {
  if (!bufferCache.has(url)) {
    const p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      const type = res.headers.get('content-type') || ''
      if (type.includes('text/html')) throw new Error(`${url} not found (got HTML)`)
      return readWithProgress(res, url)
    })
    p.catch(() => bufferCache.delete(url))
    bufferCache.set(url, p)
  }
  return bufferCache.get(url)
}

/** Warm the network cache for all avatar models + animations (call from lobby). */
export function preloadAvatarAssets() {
  Object.values(CHARACTER_CATALOG).forEach((c) => fetchModelBuffer(c.modelUrl).catch(() => {}))
  loadAnimationLibrary().catch(() => {})
}

let animationLibraryPromise = null
/** Loads the Mixamo animation library (once). Resolves to { asset, clips } or null. */
export function loadAnimationLibrary() {
  if (!animationLibraryPromise) {
    animationLibraryPromise = fetchModelBuffer(ANIMATION_LIBRARY_URL)
      .then((buf) => new GLTFLoader().parseAsync(buf, '/models/'))
      .then((gltf) => {
        gltf.scene.updateMatrixWorld(true)
        const clips = {}
        gltf.animations.forEach((clip) => {
          clips[clip.name] = clip
        })
        return { asset: gltf.scene, clips }
      })
      .catch((err) => {
        console.warn('[VRMLoader] Animation library unavailable, using procedural motion only:', err?.message || err)
        return null
      })
  }
  return animationLibraryPromise
}

// Retargeted clips are identical for every instance of the same character (same node names).
const retargetCache = new Map()
function getRetargetedClips(characterKey, vrm, library) {
  if (!library) return null
  if (!retargetCache.has(characterKey)) {
    const out = {}
    for (const name of ['idle', 'agree', 'walk', 'run']) {
      const src = library.clips[name]
      if (src) out[name] = retargetMixamoClipToVRM(src, vrm, library.asset)
    }
    retargetCache.set(characterKey, out)
  }
  return retargetCache.get(characterKey)
}

function getHumanoidBone(vrm, boneName) {
  return vrm?.humanoid?.getNormalizedBoneNode(boneName) || null
}

function applyMaterialFixes(modelScene, meta) {
  const matTints = meta.tintMaterials ? Object.entries(meta.tintMaterials) : []
  const replaced = new Map()

  modelScene.traverse((obj) => {
    if (!obj.isMesh) return
    // VRM bones move far outside bind-pose bounds; skip culling to avoid limbs popping
    obj.frustumCulled = false
    const parentName = (obj.parent?.name || '').toLowerCase()

    const convert = (mat) => {
      if (!mat) return mat
      const matName = (mat.name || '').toLowerCase()
      const tintEntry = matTints.find(
        ([key]) => matName.includes(key.toLowerCase()) || parentName.includes(key.toLowerCase()),
      )
      const tintHex = tintEntry ? tintEntry[1] : ''
      const cacheKey = `${mat.uuid}|${tintHex}`
      if (replaced.has(cacheKey)) return replaced.get(cacheKey)

      let next = mat
      if (meta.toon && mat.isMeshStandardMaterial) {
        next = new THREE.MeshToonMaterial({
          name: mat.name,
          map: mat.map,
          color: mat.color.clone(),
          gradientMap: getToonGradient(),
          transparent: mat.transparent,
          alphaTest: mat.alphaTest,
          side: mat.side,
        })
        mat.dispose()
      }
      if (tintHex && !next.map) {
        if (next === mat) next = mat.clone()
        next.color?.set(tintHex)
      }
      replaced.set(cacheKey, next)
      return next
    }
    obj.material = Array.isArray(obj.material) ? obj.material.map(convert) : convert(obj.material)
  })
}

/**
 * Computes the true world-space bounding box of a VRM scene by sampling skinned vertex
 * positions (`applyBoneTransform`). `Box3.setFromObject` cannot be used directly on models
 * whose raw vertex attributes are baked in a different unit scale from their skeleton (e.g. miku.vrm).
 */
function computeSkinnedBounds(modelScene) {
  modelScene.updateMatrixWorld(true)
  const box = new THREE.Box3()
  const v = new THREE.Vector3()

  modelScene.traverse((obj) => {
    if (!obj.isMesh || !obj.visible || !obj.geometry?.attributes?.position) return
    const pos = obj.geometry.attributes.position
    const idx = obj.geometry.index
    const count = idx ? idx.count : pos.count
    const step = Math.max(1, Math.floor(count / 300))

    for (let i = 0; i < count; i += step) {
      const vi = idx ? idx.getX(i) : i
      v.fromBufferAttribute(pos, vi)
      if (obj.isSkinnedMesh && typeof obj.applyBoneTransform === 'function') {
        obj.applyBoneTransform(vi, v)
      }
      v.applyMatrix4(obj.matrixWorld)
      box.expandByPoint(v)
    }
  })

  if (box.isEmpty()) box.setFromObject(modelScene)
  return box
}

/**
 * Normalizes the model so the head bone sits at `headHeight`, feet rest on y=0
 * and the hips are centred on the origin.
 */
function normalizeModelTransform(vrm, modelScene, headHeight) {
  const box = computeSkinnedBounds(modelScene)
  const head = getHumanoidBone(vrm, 'head')
  const tmp = new THREE.Vector3()

  let scale = 1
  if (head) {
    head.getWorldPosition(tmp)
    const headAboveFeet = tmp.y - box.min.y
    if (headAboveFeet > 0.001) scale = headHeight / headAboveFeet
  } else {
    const h = box.max.y - box.min.y
    if (h > 0.001) scale = (headHeight / 0.85) / h
  }
  modelScene.scale.multiplyScalar(scale)
  modelScene.updateMatrixWorld(true)

  const scaledBox = computeSkinnedBounds(modelScene)
  const hips = getHumanoidBone(vrm, 'hips')
  if (hips) hips.getWorldPosition(tmp)
  else scaledBox.getCenter(tmp)
  modelScene.position.set(-tmp.x, -scaledBox.min.y, -tmp.z)
  modelScene.updateMatrixWorld(true)
}

/**
 * Attaches handheld props directly to `rootGroup` (which is normalized to 1m units),
 * eliminating per-model scale and bone-axis differences.
 */
function attachProps(rootGroup, characterKey) {
  const mic = createMicrophoneProp()
  mic.visible = false
  rootGroup.add(mic)

  const stick = createGlowstickProp(characterKey)
  stick.visible = false
  rootGroup.add(stick)

  return { mic, stick }
}

/**
 * Loads `/models/${character}.vrm` (downloaded once, parsed per instance), normalizes its size,
 * fixes materials, attaches props, and calibrates poses against the avatar's actual bone geometry.
 * Falls back to a primitive placeholder if the .vrm cannot be loaded.
 */
export async function loadCharacterAvatar(characterKey = 'miku') {
  const normalizedKey = characterKey === 'teto' ? 'teto' : 'miku'
  const meta = CHARACTER_CATALOG[normalizedKey]

  try {
    const [buffer, library] = await Promise.all([fetchModelBuffer(meta.modelUrl), loadAnimationLibrary()])
    const gltf = await getLoader().parseAsync(buffer, '/models/')
    const vrm = gltf.userData.vrm
    if (!vrm) throw new Error(`No VRM data in ${meta.publicPath}`)

    const isVRM0 = String(vrm.meta?.metaVersion ?? '0') === '0'
    VRMUtils.removeUnnecessaryVertices(vrm.scene)
    if (typeof VRMUtils.combineSkeletons === 'function') VRMUtils.combineSkeletons(vrm.scene)
    VRMUtils.rotateVRM0(vrm)

    const modelScene = vrm.scene
    applyMaterialFixes(modelScene, meta)
    normalizeModelTransform(vrm, modelScene, meta.headHeight)

    const rootGroup = new THREE.Group()
    rootGroup.name = `AvatarRoot_${normalizedKey}`
    rootGroup.add(modelScene)

    const bones = {}
    for (const name of [
      'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
      'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
      'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg',
    ]) {
      bones[name] = getHumanoidBone(vrm, name)
    }
    if (!bones.chest) bones.chest = bones.upperChest

    // Self-calibrate singing/cheering/idle arm poses from this avatar's actual bone directions
    const poses = calibrateAvatarPoses(vrm, rootGroup, bones)
    const props = attachProps(rootGroup, normalizedKey)

    let mixer = null
    let actions = null
    if (meta.useMixamoClips) {
      const clips = getRetargetedClips(normalizedKey, vrm, library)
      if (clips?.idle) {
        mixer = new THREE.AnimationMixer(modelScene)
        actions = {}
        for (const [name, clip] of Object.entries(clips)) actions[name] = mixer.clipAction(clip)
        actions.idle.play()
        actions.idle.time = Math.random() * clips.idle.duration
        // Locomotion layers always run (weight 0) so their phase stays continuous when crossfaded in
        for (const key of ['walk', 'run']) {
          if (!actions[key]) continue
          actions[key].setEffectiveWeight(0)
          actions[key].play()
        }
      }
    }

    if (missingModelFiles.delete(meta.publicPath)) notifyMissingModels()

    return baseRecord({
      character: normalizedKey,
      vrm,
      scene: modelScene,
      rootGroup,
      bones,
      poses,
      restQuats: {},
      armSign: -1,
      isVRM0,
      isPlaceholder: false,
      missingFile: null,
      mixer,
      actions,
      props,
      headAnchor: bones.head,
    })
  } catch (err) {
    console.warn(`[VRMLoader] Failed to load ${meta.publicPath} (${err?.message || err}). Using placeholder.`)
    if (!missingModelFiles.has(meta.publicPath)) {
      missingModelFiles.add(meta.publicPath)
      notifyMissingModels()
    }
    return createPlaceholderAvatar(normalizedKey)
  }
}

/**
 * Full GPU memory cleanup for VRM scenes, geometries, materials, textures and mixers.
 */
export function disposeAvatarRecord(record) {
  if (!record) return

  if (record.mixer) {
    record.mixer.stopAllAction()
    record.mixer.uncacheRoot(record.mixer.getRoot())
  }

  const root = record.rootGroup || record.scene
  if (root) {
    root.parent?.remove(root)
    root.traverse((obj) => {
      if (obj.geometry && !obj.geometry.userData?.isShared) obj.geometry.dispose()
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((mat) => {
          if (!mat || mat.userData?.isShared) return
          Object.values(mat).forEach((val) => {
            if (val?.isTexture && !val.userData?.isShared) val.dispose()
          })
          // ShaderMaterial (MToon) keeps textures in uniforms
          if (mat.uniforms) {
            Object.values(mat.uniforms).forEach((u) => {
              if (u?.value?.isTexture && !u.value.userData?.isShared) u.value.dispose()
            })
          }
          mat.dispose()
        })
      }
    })
  }
  record.disposed = true
}
