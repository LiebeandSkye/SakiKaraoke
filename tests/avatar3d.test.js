import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'

import * as THREE from 'three'
import {
  calibrateAvatarPoses,
  mixamoVRMRigMap,
  resolveVRMHumanoidBoneName,
  updateAvatarAnimationFrame,
} from '../src/three/mixamoVRMRigMap.js'
import {
  createPlaceholderAvatar,
  disposeAvatarRecord,
} from '../src/three/vrmLoader.js'

describe('3D VRM avatar pipeline & guardrails', () => {
  it('verifies /public/models/miku.vrm and /public/models/teto.vrm exist with valid VRM glTF headers', () => {
    for (const file of ['public/models/miku.vrm', 'public/models/teto.vrm']) {
      assert.equal(fs.existsSync(file), true, `Expected ${file} to exist`)
      const buf = fs.readFileSync(file)
      assert.equal(buf.toString('utf8', 0, 4), 'glTF')
      const jsonLen = buf.readUInt32LE(12)
      const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen))
      assert.ok(
        gltf.extensions?.VRM || gltf.extensions?.VRMC_vrm,
        `Expected ${file} to contain VRM extension metadata`,
      )
    }
  })

  it('maps Mixamo bone names to VRM humanoid bone names via mixamoVRMRigMap', () => {
    assert.equal(resolveVRMHumanoidBoneName('mixamorig:Hips'), 'hips')
    assert.equal(resolveVRMHumanoidBoneName('mixamorig:Spine1'), 'chest')
    assert.equal(resolveVRMHumanoidBoneName('mixamorig:Head'), 'head')
    assert.equal(resolveVRMHumanoidBoneName('mixamorig:RightArm'), 'rightUpperArm')
    assert.equal(resolveVRMHumanoidBoneName('mixamorig:LeftForeArm'), 'leftLowerArm')
    assert.ok(Object.keys(mixamoVRMRigMap).length >= 50)
  })

  it('suppresses stationary singing while the avatar is walking and restores it when it stops', () => {
    const stub = createPlaceholderAvatar('teto')
    stub.animationState = 'singing'
    stub.moveSpeed = 2
    for (let i = 0; i < 40; i += 1) updateAvatarAnimationFrame(stub, 0.05, i * 0.05)
    assert.ok(stub.singIntensity < 0.02, `singing should fade while walking, got ${stub.singIntensity}`)

    stub.moveSpeed = 0
    for (let i = 0; i < 80; i += 1) updateAvatarAnimationFrame(stub, 0.05, 2 + i * 0.05)
    assert.ok(stub.singIntensity > 0.9, `singing should resume at rest, got ${stub.singIntensity}`)
    disposeAvatarRecord(stub)
  })
  it('calibrates world-space two-bone arm poses regardless of T-pose or A-pose rest skeleton', () => {
    const rootGroup = new THREE.Group()
    const rightUpperArm = new THREE.Bone()
    rightUpperArm.position.set(-0.18, 1.25, 0)
    // Simulate a pre-baked A-pose rest rotation on the upper arm
    rightUpperArm.quaternion.setFromEuler(new THREE.Euler(0, 0, -0.55))

    const rightLowerArm = new THREE.Bone()
    rightLowerArm.position.set(-0.24, 0, 0)
    const rightHand = new THREE.Bone()
    rightHand.position.set(-0.22, 0, 0)

    rightUpperArm.add(rightLowerArm)
    rightLowerArm.add(rightHand)
    rootGroup.add(rightUpperArm)

    const poses = calibrateAvatarPoses(null, rootGroup, {
      rightUpperArm,
      rightLowerArm,
      rightHand,
    })

    assert.ok(poses.micUpper, 'Expected calibrated micUpper quaternion')
    assert.ok(poses.micLower, 'Expected calibrated micLower quaternion')
    assert.ok(poses.idleRightUpper, 'Expected calibrated idleRightUpper quaternion')

    // Apply calibrated mic pose and verify hand moves in front of the chest/head (+Z, elevated Y)
    rightUpperArm.quaternion.copy(poses.micUpper)
    rightLowerArm.quaternion.copy(poses.micLower)
    rootGroup.updateMatrixWorld(true)

    const handWorld = new THREE.Vector3()
    rightHand.getWorldPosition(handWorld)
    assert.ok(handWorld.z > 0.15, `Expected mic hand in front of body (+Z), got z=${handWorld.z}`)
    assert.ok(handWorld.y > 1.15, `Expected mic hand elevated near mouth, got y=${handWorld.y}`)
  })

  it('animates singing, cheering, and idle states and disposes props cleanly', () => {
    const mikuStub = createPlaceholderAvatar('miku')
    assert.equal(mikuStub.isPlaceholder, true)
    assert.equal(mikuStub.character, 'miku')
    assert.ok(mikuStub.props?.mic?.isGroup)

    mikuStub.animationState = 'singing'
    updateAvatarAnimationFrame(mikuStub, 0.05, 1.5)
    assert.ok(mikuStub.singIntensity > 0)

    mikuStub.animationState = 'cheering'
    updateAvatarAnimationFrame(mikuStub, 0.05, 2.0)
    assert.ok(mikuStub.cheerIntensity > 0)

    disposeAvatarRecord(mikuStub)
  })
})
