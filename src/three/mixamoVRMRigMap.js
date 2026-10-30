import * as THREE from 'three'
import { DRINK_CATALOG } from '../shared/barSystem.js'

/**
 * Standard Mixamo-to-VRM humanoid bone name mapping (`mixamoVRMRigMap`).
 * Supports both `mixamorigHips` and `mixamorig:Hips` naming conventions.
 */
export const mixamoVRMRigMap = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbProximal',
  mixamorigLeftHandThumb2: 'leftThumbIntermediate',
  mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal',
  mixamorigLeftHandIndex2: 'leftIndexIntermediate',
  mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal',
  mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal',
  mixamorigLeftHandRing2: 'leftRingIntermediate',
  mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal',
  mixamorigLeftHandPinky2: 'leftLittleIntermediate',
  mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigRightHandThumb1: 'rightThumbProximal',
  mixamorigRightHandThumb2: 'rightThumbIntermediate',
  mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal',
  mixamorigRightHandIndex2: 'rightIndexIntermediate',
  mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandRing1: 'rightRingProximal',
  mixamorigRightHandRing2: 'rightRingIntermediate',
  mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandPinky1: 'rightLittleProximal',
  mixamorigRightHandPinky2: 'rightLittleIntermediate',
  mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
}

/**
 * Normalizes a raw Mixamo bone identifier (e.g. `mixamorig:Hips` or `Armature|mixamorig:Spine`)
 * and looks up its corresponding VRM humanoid bone name.
 */
export function resolveVRMHumanoidBoneName(rawTrackBoneName) {
  if (!rawTrackBoneName) return null
  const clean = rawTrackBoneName.split('|').pop().replace(':', '')
  return mixamoVRMRigMap[clean] || null
}

/**
 * Converts a rotation authored in the VRM 1.0 normalized frame (character faces +Z)
 * into the frame of the given rig. VRM 0.x rigs face -Z, i.e. a 180° turn about Y.
 */
export function toRigFrame(quat, isVRM0, target = new THREE.Quaternion()) {
  target.copy(quat)
  if (isVRM0) {
    target.x = -target.x
    target.z = -target.z
  }
  return target
}

/**
 * Retargets a Mixamo AnimationClip onto a VRM's normalized humanoid rig using the rest-pose
 * compensation from the official three-vrm Mixamo example. Position/scale tracks are dropped
 * so avatars stay planted on their stage marks.
 */
export function retargetMixamoClipToVRM(clip, vrm, asset) {
  if (!clip || !vrm?.humanoid) return null

  const tracks = []
  const isVRM0 = String(vrm.meta?.metaVersion ?? '0') === '0'
  const restRotationInverse = new THREE.Quaternion()
  const parentRestWorldRotation = new THREE.Quaternion()
  const q = new THREE.Quaternion()
  asset?.updateMatrixWorld(true)

  for (const track of clip.tracks) {
    const [rawNodeName, propertyName] = track.name.split('.')
    if (propertyName !== 'quaternion') continue
    const vrmBoneName = resolveVRMHumanoidBoneName(rawNodeName)
    if (!vrmBoneName) continue
    const vrmNode = vrm.humanoid.getNormalizedBoneNode(vrmBoneName)
    if (!vrmNode) continue

    const values = new Float32Array(track.values.length)
    const rigNode = asset?.getObjectByName(rawNodeName)
    if (rigNode?.parent) {
      rigNode.getWorldQuaternion(restRotationInverse).invert()
      rigNode.parent.getWorldQuaternion(parentRestWorldRotation)
    } else {
      restRotationInverse.identity()
      parentRestWorldRotation.identity()
    }

    for (let i = 0; i < track.values.length; i += 4) {
      q.fromArray(track.values, i).premultiply(parentRestWorldRotation).multiply(restRotationInverse)
      values[i] = isVRM0 ? -q.x : q.x
      values[i + 1] = q.y
      values[i + 2] = isVRM0 ? -q.z : q.z
      values[i + 3] = q.w
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${vrmNode.name}.quaternion`, track.times, values))
  }

  return new THREE.AnimationClip(`vrm_${clip.name}`, clip.duration, tracks)
}

/**
 * Calibrates local bone quaternions for a 2-bone limb chain (`upper` -> `lower` -> `hand`)
 * by measuring the actual world-space joint vectors of the loaded VRM. This works identically
 * whether the model was exported in a T-pose (Teto) or a pre-baked A-pose (Miku).
 */
function solveTwoBonePose(vrm, rootGroup, upper, lower, hand, wantUpperDir, wantLowerDir) {
  if (!upper || !lower || !hand) {
    return { upperQ: new THREE.Quaternion(), lowerQ: new THREE.Quaternion() }
  }
  const origUpperQ = upper.quaternion.clone()
  const origLowerQ = lower.quaternion.clone()
  vrm?.humanoid?.resetNormalizedPose?.()
  vrm?.update?.(0)
  rootGroup.updateMatrixWorld(true)

  const pU = new THREE.Vector3()
  const pL = new THREE.Vector3()
  const pH = new THREE.Vector3()
  const pq = new THREE.Quaternion()

  upper.getWorldPosition(pU)
  lower.getWorldPosition(pL)
  const curUpper = pL.clone().sub(pU).normalize()
  const deltaU = new THREE.Quaternion().setFromUnitVectors(curUpper, wantUpperDir.clone().normalize())
  upper.parent.getWorldQuaternion(pq)
  const upperQ = pq.clone().invert().multiply(deltaU).multiply(pq)
  upper.quaternion.copy(upperQ)
  vrm?.update?.(0)
  rootGroup.updateMatrixWorld(true)

  lower.getWorldPosition(pL)
  hand.getWorldPosition(pH)
  const curLower = pH.clone().sub(pL).normalize()
  const deltaL = new THREE.Quaternion().setFromUnitVectors(curLower, wantLowerDir.clone().normalize())
  lower.parent.getWorldQuaternion(pq)
  const lowerQ = pq.clone().invert().multiply(deltaL).multiply(pq)

  if (vrm?.humanoid?.resetNormalizedPose) {
    vrm.humanoid.resetNormalizedPose()
    vrm.update(0)
  } else {
    upper.quaternion.copy(origUpperQ)
    lower.quaternion.copy(origLowerQ)
  }
  rootGroup.updateMatrixWorld(true)
  return { upperQ, lowerQ }
}

/**
 * Computes per-avatar calibrated poses for idle, singing (mic to mouth + rhythm gesture),
 * and cheering (penlight raised high).
 */
export function calibrateAvatarPoses(vrm, rootGroup, bones) {
  // Right arm: holds microphone near mouth
  const mic = solveTwoBonePose(
    vrm,
    rootGroup,
    bones.rightUpperArm,
    bones.rightLowerArm,
    bones.rightHand,
    new THREE.Vector3(-0.35, -0.78, 0.52),
    new THREE.Vector3(0.45, 0.72, 0.52),
  )

  // Left arm (singing): expressive rhythm gesture out front
  const gesture = solveTwoBonePose(
    vrm,
    rootGroup,
    bones.leftUpperArm,
    bones.leftLowerArm,
    bones.leftHand,
    new THREE.Vector3(0.5, -0.68, 0.45),
    new THREE.Vector3(0.15, 0.35, 0.92),
  )

  // Left arm (cheering): penlight raised high
  const cheer = solveTwoBonePose(
    vrm,
    rootGroup,
    bones.leftUpperArm,
    bones.leftLowerArm,
    bones.leftHand,
    new THREE.Vector3(0.38, 0.68, 0.55),
    new THREE.Vector3(-0.1, 0.92, 0.35),
  )

  // Relaxed idle arms (used when the model doesn't use a Mixamo idle clip)
  const idleRight = solveTwoBonePose(
    vrm,
    rootGroup,
    bones.rightUpperArm,
    bones.rightLowerArm,
    bones.rightHand,
    new THREE.Vector3(-0.26, -0.95, 0.08),
    new THREE.Vector3(-0.1, -0.95, 0.28),
  )
  const idleLeft = solveTwoBonePose(
    vrm,
    rootGroup,
    bones.leftUpperArm,
    bones.leftLowerArm,
    bones.leftHand,
    new THREE.Vector3(0.26, -0.95, 0.08),
    new THREE.Vector3(0.1, -0.95, 0.28),
  )

  // Right arm holding a juice glass out in front of chest/waist
  const drinkHold = solveTwoBonePose(
    vrm,
    rootGroup,
    bones.rightUpperArm,
    bones.rightLowerArm,
    bones.rightHand,
    new THREE.Vector3(-0.28, -0.88, 0.32),
    new THREE.Vector3(0.22, 0.18, 0.92),
  )

  return {
    micUpper: mic.upperQ,
    micLower: mic.lowerQ,
    gestureUpper: gesture.upperQ,
    gestureLower: gesture.lowerQ,
    cheerUpper: cheer.upperQ,
    cheerLower: cheer.lowerQ,
    idleRightUpper: idleRight.upperQ,
    idleRightLower: idleRight.lowerQ,
    idleLeftUpper: idleLeft.upperQ,
    idleLeftLower: idleLeft.lowerQ,
    drinkUpper: drinkHold.upperQ,
    drinkLower: drinkHold.lowerQ,
  }
}

// Pre-allocated scratch objects: zero allocations inside the rAF loop
const _e = new THREE.Euler()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _vHand = new THREE.Vector3()
const _vHead = new THREE.Vector3()
const _vDir = new THREE.Vector3()
const _upY = new THREE.Vector3(0, 1, 0)

function addRotation(bone, isVRM0, x, y, z) {
  if (!bone) return
  _e.set(x, y, z, 'XYZ')
  _q.setFromEuler(_e)
  toRigFrame(_q, isVRM0, _q2)
  bone.quaternion.multiply(_q2)
}

function blendLocalQuat(bone, targetQuat, weight) {
  if (!bone || !targetQuat || weight <= 0.001) return
  bone.quaternion.slerp(targetQuat, Math.min(1, weight))
}

const damp = THREE.MathUtils.damp
const lerp = THREE.MathUtils.lerp

const WALK_REF_SPEED = 1.45 // m/s the Mixamo walk cycle covers at timeScale 1
const RUN_REF_SPEED = 3.6
const smoothstep = THREE.MathUtils.smoothstep
const clamp = THREE.MathUtils.clamp

/**
 * Crossfades idle / walk / run clips from ec.moveSpeed (m/s) and syncs stride cadence to speed.
 * Returns true while the avatar is travelling or in the air.
 */
function driveLocomotion(rec, deltaSec) {
  const speed = rec.moveSpeed ?? 0
  rec.airborne = damp(rec.airborne ?? 0, rec.isAirborne ? 1 : 0, rec.isAirborne ? 22 : 12, deltaSec)
  rec.moveBlend = damp(rec.moveBlend ?? 0, speed > 0.2 ? 1 : 0, 10, deltaSec)
  const a = rec.actions
  if (a?.walk && a?.run && a?.idle) {
    const runW = smoothstep(speed, 2.7, 3.5)
    const idleW = 1 - smoothstep(speed, 0.05, 0.7)
    const walkW = Math.max(0, 1 - idleW - runW)
    const sum = idleW + walkW + runW || 1
    const k = 1 - Math.exp(-14 * deltaSec)
    rec.wIdle = (rec.wIdle ?? 1) + (idleW / sum - (rec.wIdle ?? 1)) * k
    rec.wWalk = (rec.wWalk ?? 0) + (walkW / sum - (rec.wWalk ?? 0)) * k
    rec.wRun = (rec.wRun ?? 0) + (runW / sum - (rec.wRun ?? 0)) * k
    a.idle.setEffectiveWeight(rec.wIdle)
    a.walk.setEffectiveWeight(rec.wWalk)
    a.run.setEffectiveWeight(rec.wRun)
    a.walk.setEffectiveTimeScale(clamp(speed / WALK_REF_SPEED, 0.7, 1.7))
    a.run.setEffectiveTimeScale(clamp(speed / RUN_REF_SPEED, 0.75, 1.35))
  }
  return speed > 0.2 || rec.airborne > 0.05
}

/** Additive jump/fall pose on the normalized humanoid (after the mixer has written clip poses). */
function applyAirbornePose(rec, isVRM0, b) {
  const air = rec.airborne ?? 0
  if (air < 0.01) return
  const rising = clamp(rec.verticalSpeed ?? 0, -1, 1) // + going up, - falling
  const tuck = air * (0.55 + 0.25 * rising)
  addRotation(b.leftUpperLeg, isVRM0, -0.7 * tuck, 0, 0.05 * air)
  addRotation(b.rightUpperLeg, isVRM0, -0.25 * tuck, 0, -0.05 * air)
  addRotation(b.leftLowerLeg, isVRM0, 1.15 * tuck, 0, 0)
  addRotation(b.rightLowerLeg, isVRM0, 0.5 * tuck, 0, 0)
  addRotation(b.spine, isVRM0, 0.05 * air, 0, 0)
  const armLift = air * (0.45 + 0.35 * Math.max(0, rising))
  addRotation(b.leftUpperArm, isVRM0, 0, 0, 0.6 * armLift)
  addRotation(b.rightUpperArm, isVRM0, 0, 0, -0.6 * armLift)
  addRotation(b.leftLowerArm, isVRM0, 0, 0, 0.15 * armLift)
  addRotation(b.rightLowerArm, isVRM0, 0, 0, -0.15 * armLift)
}

/**
 * Drives avatar states ('idle' | 'singing' | 'cheering').
 * Performs zero `new THREE.*` allocations per frame.
 */
export function updateAvatarAnimationFrame(rec, deltaSec, elapsedSec) {
  if (!rec) return
  const state = rec.animationState || 'idle'
  const sitting = Boolean(rec.isSitting)
  if (sitting) {
    rec.moveSpeed = 0
    rec.isAirborne = false
  }
  // Walking/jumping suppresses the stationary singing & cheering poses
  const moving = driveLocomotion(rec, deltaSec)
  const hasDrink = Boolean(rec.heldDrinkKey)
  rec.singIntensity = damp(rec.singIntensity ?? 0, state === 'singing' && !moving && !rec.isBartending ? 1 : 0, 5.5, deltaSec)
  rec.cheerIntensity = damp(rec.cheerIntensity ?? 0, state === 'cheering' && !moving && !rec.isBartending ? 1 : 0, 4.5, deltaSec)
  rec.sitIntensity = damp(rec.sitIntensity ?? 0, sitting ? 1 : 0, 10, deltaSec)
  rec.drinkHoldIntensity = damp(rec.drinkHoldIntensity ?? 0, hasDrink ? 1 : 0, 8, deltaSec)
  rec.sipIntensity = damp(rec.sipIntensity ?? 0, hasDrink && rec.isSipping ? 1 : 0, 9, deltaSec)
  rec.bartendIntensity = damp(rec.bartendIntensity ?? 0, rec.isBartending ? 1 : 0, 7, deltaSec)

  if (rec.isPlaceholder) {
    updatePlaceholder(rec, deltaSec, elapsedSec)
    return
  }

  const s = rec.singIntensity
  const c = rec.cheerIntensity
  const sit = rec.sitIntensity
  const dHold = rec.drinkHoldIntensity
  const sip = rec.sipIntensity
  const bt = rec.bartendIntensity
  const v0 = rec.isVRM0
  const b = rec.bones || {}
  const poses = rec.poses
  // Beat clock: shared song time when available so every client grooves in phase
  const beat = (rec.beatTime || elapsedSec + rec.phaseOffset) * Math.PI * 2 * 2 // ~120 BPM
  const t = elapsedSec + rec.phaseOffset

  // 1. Base idle layer
  if (rec.mixer) {
    rec.mixer.update(deltaSec)
  } else if (poses) {
    // Reset normalized bones to identity and apply calibrated relaxed stance + gentle breathing
    rec.vrm?.humanoid?.resetNormalizedPose()
    blendLocalQuat(b.rightUpperArm, poses.idleRightUpper, 1)
    blendLocalQuat(b.rightLowerArm, poses.idleRightLower, 1)
    blendLocalQuat(b.leftUpperArm, poses.idleLeftUpper, 1)
    blendLocalQuat(b.leftLowerArm, poses.idleLeftLower, 1)
    addRotation(b.spine, v0, Math.sin(t * 2.0) * 0.025, 0, Math.cos(t * 1.3) * 0.018)
    addRotation(b.chest, v0, Math.sin(t * 2.0 - 0.5) * 0.02, Math.sin(t * 0.9) * 0.025, 0)
    addRotation(b.head, v0, Math.sin(t * 1.6) * 0.025, Math.sin(t * 0.75) * 0.045, Math.sin(t * 1.1) * 0.02)
    addRotation(b.rightUpperArm, v0, Math.sin(t * 2.0) * 0.025, 0, 0)
    addRotation(b.leftUpperArm, v0, Math.sin(t * 2.0 + 1.2) * 0.025, 0, 0)
  }

  // 2. Root groove (bounce on the beat, sway). Skipped when a controller owns the root transform.
  if (rec.rootGroup && !rec.externalTransform) {
    const idleBob = rec.mixer ? 0 : Math.sin(t * 2.0) * 0.008
    const bounce = Math.abs(Math.sin(beat / 2)) * (0.032 * s + 0.022 * c)
    rec.rootGroup.position.y = rec.basePosition.y + idleBob * (1 - s - c) + bounce
    const sway = Math.sin(beat / 4) * (0.11 * s + 0.075 * c)
    rec.rootGroup.rotation.y = rec.baseRotationY + sway
  }

  // 3. Torso & head performance (additive on top of base idle)
  const groove = Math.sin(beat / 2)
  addRotation(b.spine, v0, 0.04 * s + groove * 0.025 * (s + c), 0, Math.sin(beat / 4) * 0.055 * (s + c))
  addRotation(b.chest, v0, groove * 0.03 * s, Math.sin(beat / 4) * 0.05 * s, 0)
  const look = rec.lookYaw || 0
  addRotation(
    b.neck || b.head,
    v0,
    -0.05 * s + Math.abs(groove) * 0.055 * (s + c),
    look * (1 - s) * 0.65 + Math.sin(beat / 8) * 0.11 * s,
    Math.sin(beat / 4) * 0.055 * (s + c),
  )

  // 4. Calibrated Singing, Cheering, Drinking & Bartending Arm Poses
  if (poses) {
    // If holding a drink, right arm holds the glass (and raises to mouth when sipping)
    const micWeight = s * (1 - dHold)
    blendLocalQuat(b.rightUpperArm, poses.micUpper, micWeight)
    blendLocalQuat(b.rightLowerArm, poses.micLower, micWeight)
    addRotation(b.rightUpperArm, v0, groove * 0.03 * micWeight, 0, 0)

    if (dHold > 0.01) {
      blendLocalQuat(b.rightUpperArm, poses.drinkUpper, dHold * (1 - sip))
      blendLocalQuat(b.rightLowerArm, poses.drinkLower, dHold * (1 - sip))
      blendLocalQuat(b.rightUpperArm, poses.micUpper, sip)
      blendLocalQuat(b.rightLowerArm, poses.micLower, sip)
      addRotation(b.rightLowerArm, v0, -0.22 * sip, 0, 0)
    }

    if (bt > 0.01) {
      // Energetic cocktail-shaker motion in front of chest while bartending
      const shakeWave = Math.sin(t * 14)
      blendLocalQuat(b.rightUpperArm, poses.micUpper, bt * 0.85)
      blendLocalQuat(b.rightLowerArm, poses.micLower, bt * 0.85)
      blendLocalQuat(b.leftUpperArm, poses.gestureUpper, bt * 0.85)
      blendLocalQuat(b.leftLowerArm, poses.gestureLower, bt * 0.85)
      addRotation(b.rightUpperArm, v0, shakeWave * 0.18 * bt, 0, 0)
      addRotation(b.leftUpperArm, v0, -shakeWave * 0.14 * bt, 0, 0)
    }

    blendLocalQuat(b.leftUpperArm, poses.gestureUpper, s * 0.85 * (1 - bt))
    blendLocalQuat(b.leftLowerArm, poses.gestureLower, s * 0.85 * (1 - bt))
    addRotation(b.leftUpperArm, v0, Math.sin(beat / 4 + 1) * 0.1 * s * (1 - bt), Math.sin(beat / 8) * 0.14 * s * (1 - bt), 0)

    blendLocalQuat(b.leftUpperArm, poses.cheerUpper, c * (1 - bt))
    blendLocalQuat(b.leftLowerArm, poses.cheerLower, c * (1 - bt))
    addRotation(b.leftUpperArm, v0, Math.sin(beat / 2) * 0.25 * c * (1 - bt), 0, 0)
  }

  if (sip > 0.02) {
    addRotation(b.neck || b.head, v0, -0.22 * sip, 0, 0)
  }

  // 5. Knees dip on the beat (or bend into a seated posture when sitting on a sofa/stool)
  if (sit > 0.01) {
    // Seated posture: thighs horizontal (-1.42 rad), knees bent down (+1.42 rad)
    if (b.leftUpperLeg) b.leftUpperLeg.quaternion.identity()
    if (b.rightUpperLeg) b.rightUpperLeg.quaternion.identity()
    if (b.leftLowerLeg) b.leftLowerLeg.quaternion.identity()
    if (b.rightLowerLeg) b.rightLowerLeg.quaternion.identity()
    addRotation(b.leftUpperLeg, v0, -1.42 * sit, 0, 0.06 * sit)
    addRotation(b.rightUpperLeg, v0, -1.42 * sit, 0, -0.06 * sit)
    addRotation(b.leftLowerLeg, v0, 1.42 * sit, 0, 0)
    addRotation(b.rightLowerLeg, v0, 1.42 * sit, 0, 0)
    addRotation(b.spine, v0, -0.05 * sit, 0, 0)
  } else {
    const dip = Math.abs(Math.sin(beat / 2)) * 0.09 * (s + c * 0.75)
    addRotation(b.leftUpperLeg, v0, -dip, 0, 0)
    addRotation(b.rightUpperLeg, v0, -dip, 0, 0)
    addRotation(b.leftLowerLeg, v0, dip * 2, 0, 0)
    addRotation(b.rightLowerLeg, v0, dip * 2, 0, 0)
  }

  // 5b. Airborne pose (tucked legs, arms out) layered over the locomotion clips
  if (sit < 0.05) applyAirbornePose(rec, v0, b)

  // 6. Facial expressions (lip flap is stylised, not audio-driven)
  const em = rec.vrm?.expressionManager
  if (em) {
    rec.blinkTimer -= deltaSec
    if (rec.blinkTimer <= 0) {
      rec.blinkValue = 1
      rec.blinkTimer = 2.5 + Math.random() * 3.5
    }
    rec.blinkValue = Math.max(0, rec.blinkValue - deltaSec * 7)
    const blink = rec.blinkValue > 0.5 ? (1 - rec.blinkValue) * 2 : rec.blinkValue * 2
    const syllable = Math.abs(Math.sin(t * 9.5)) * (0.55 + 0.45 * Math.sin(t * 2.3))
    em.setValue('aa', s > 0.05 ? (0.15 + 0.6 * syllable) * s * (1 - sip) : 0)
    em.setValue('oh', Math.max(sip * 0.45, s > 0.05 ? Math.max(0, Math.sin(t * 4.1)) * 0.25 * s : 0))
    em.setValue('happy', Math.min(1, 0.25 * s + 0.55 * c + 0.65 * sip))
    em.setValue('blink', Math.min(1, Math.max(blink * (1 - 0.5 * c), sip * 0.6)))
  }

  // 7. Advance VRM internal managers (spring bones, expressions & normalized -> raw rig copy)
  rec.vrm?.update(deltaSec)

  // 8. Position handheld props in rootGroup space from exact hand/head world coordinates
  const mic = rec.props?.mic
  if (mic) {
    const showMic = s > 0.12 && dHold < 0.2 && b.rightHand && b.head && rec.rootGroup
    mic.visible = Boolean(showMic)
    if (showMic) {
      rec.rootGroup.updateMatrixWorld(true)
      b.rightHand.getWorldPosition(_vHand)
      b.head.getWorldPosition(_vHead)
      // Mouth target is slightly below head bone and forward along rootGroup facing
      _vHead.y -= 0.04
      _vDir.subVectors(_vHead, _vHand).normalize()
      rec.rootGroup.worldToLocal(_vHand)
      mic.position.copy(_vHand)
      _q.setFromUnitVectors(_upY, _vDir)
      mic.quaternion.copy(_q)
      const pop = Math.min(1, (s - 0.12) * 2.5)
      mic.scale.setScalar(0.4 + 0.6 * pop)
    }
  }

  const drink = rec.props?.drink
  if (drink) {
    const showDrink = dHold > 0.1 && b.rightHand && rec.rootGroup
    drink.visible = Boolean(showDrink)
    if (showDrink) {
      if (rec.heldDrinkKey && drink.userData.drinkKey !== rec.heldDrinkKey) {
        const recipe = DRINK_CATALOG[rec.heldDrinkKey] || DRINK_CATALOG.miku_fizz
        drink.userData.drinkKey = rec.heldDrinkKey
        drink.userData.liquidMat?.color?.set(recipe.color)
        drink.userData.strawMat?.color?.set(recipe.strawColor)
      }
      rec.rootGroup.updateMatrixWorld(true)
      b.rightHand.getWorldPosition(_vHand)
      rec.rootGroup.worldToLocal(_vHand)
      drink.position.copy(_vHand)
      drink.position.y += 0.015
      // Keep glass upright while holding, and tilt toward mouth when sipping
      _e.set(-0.65 * sip, 0, 0, 'XYZ')
      drink.quaternion.setFromEuler(_e)
      drink.scale.setScalar(Math.min(1, dHold * 1.4))
    }
  }

  const stick = rec.props?.stick
  if (stick) {
    const showStick = c > 0.12 && b.leftHand && b.leftLowerArm && rec.rootGroup
    stick.visible = Boolean(showStick)
    if (showStick) {
      rec.rootGroup.updateMatrixWorld(true)
      b.leftHand.getWorldPosition(_vHand)
      b.leftLowerArm.getWorldPosition(_vHead)
      _vDir.subVectors(_vHand, _vHead).normalize()
      rec.rootGroup.worldToLocal(_vHand)
      stick.position.copy(_vHand)
      _q.setFromUnitVectors(_upY, _vDir)
      stick.quaternion.copy(_q)
      const pop = Math.min(1, (c - 0.12) * 2.5)
      stick.scale.setScalar(0.4 + 0.6 * pop)
    }
  }
}

/** Legacy procedural motion for primitive placeholder rigs. */
function slerpEuler(bone, rest, x, y, z, alpha) {
  if (!bone) return
  _e.set(x, y, z, 'XYZ')
  _q.setFromEuler(_e)
  if (rest) _q.premultiply(rest)
  bone.quaternion.slerp(_q, alpha)
}

function updatePlaceholder(rec, deltaSec, elapsedSec) {
  const b = rec.bones
  const r = rec.restQuats || {}
  if (!b) return
  const s = Math.max(rec.singIntensity, rec.cheerIntensity * 0.6)
  const sit = rec.sitIntensity ?? 0
  const dHold = rec.drinkHoldIntensity ?? 0
  const sip = rec.sipIntensity ?? 0
  const phase = elapsedSec + (rec.phaseOffset || 0)
  const a = Math.min(1, deltaSec * 8)

  if (rec.rootGroup && !rec.externalTransform) {
    rec.rootGroup.position.y = rec.basePosition.y + lerp(Math.sin(phase * 2.1) * 0.01, Math.abs(Math.sin(phase * 6.2)) * 0.05, s)
    rec.rootGroup.rotation.y = rec.baseRotationY + lerp(Math.sin(phase * 0.9) * 0.04, Math.sin(phase * 3.1) * 0.14, s)
  }
  const pitch = lerp(Math.sin(phase * 2.1) * 0.03, Math.sin(phase * 6.2) * 0.08 + 0.04, s)
  slerpEuler(b.spine, r.spine, pitch, 0, 0, a)
  slerpEuler(b.head, r.head, lerp(Math.sin(phase * 1.8) * 0.035, Math.sin(phase * 6.2) * 0.11, s) - 0.2 * sip, 0, 0, a)
  const rightUpperPitch = dHold > 0.1 ? lerp(-0.45, -0.85, sip) : lerp(0.08, -0.75, rec.singIntensity)
  const rightLowerPitch = dHold > 0.1 ? lerp(-0.75, -1.25, sip) : lerp(0.15, -1.15, rec.singIntensity)
  slerpEuler(b.rightUpperArm, r.rightUpperArm, rightUpperPitch, 0, lerp(-0.12, -0.22, s), a)
  slerpEuler(b.rightLowerArm, r.rightLowerArm, rightLowerPitch, 0, 0, a)
  slerpEuler(b.leftUpperArm, r.leftUpperArm, lerp(0.08, -0.45 + Math.sin(phase * 3.1) * 0.3, s), 0, lerp(0.12, 0.35, s), a)
  slerpEuler(b.leftLowerArm, r.leftLowerArm, lerp(0.15, -0.65, s), 0, 0, a)
  slerpEuler(b.leftUpperLeg, r.leftUpperLeg, -1.4 * sit, 0, 0, a)
  slerpEuler(b.rightUpperLeg, r.rightUpperLeg, -1.4 * sit, 0, 0, a)
  slerpEuler(b.leftLowerLeg, r.leftLowerLeg, 1.4 * sit, 0, 0, a)
  slerpEuler(b.rightLowerLeg, r.rightLowerLeg, 1.4 * sit, 0, 0, a)
  if (b.jaw) slerpEuler(b.jaw, r.jaw, rec.singIntensity > 0.05 ? (0.12 + 0.18 * Math.abs(Math.sin(phase * 9.5))) * rec.singIntensity : 0, 0, 0, a)
  if (rec.props?.mic) rec.props.mic.visible = rec.singIntensity > 0.12 && dHold < 0.2
  if (rec.props?.drink) rec.props.drink.visible = dHold > 0.1
}
