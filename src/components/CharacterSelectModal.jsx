import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  CHARACTER_CATALOG,
  loadCharacterAvatar,
  disposeAvatarRecord,
  preloadAvatarAssets,
} from '../three/vrmLoader.js'
import { updateAvatarAnimationFrame } from '../three/mixamoVRMRigMap.js'
import { IoCheckmarkCircle, IoSparklesSharp, IoWarningOutline } from 'react-icons/io5'

function CharacterPreviewCanvas({ characterKey, isSelected }) {
  const canvasRef = useRef(null)
  const avatarRef = useRef(null)
  const [status, setStatus] = useState({ loading: true, isPlaceholder: false, missingFile: null })

  // Update animation state cleanly on selection toggle without destroying the WebGL context
  useEffect(() => {
    if (avatarRef.current) {
      avatarRef.current.animationState = isSelected ? 'singing' : 'idle'
    }
  }, [isSelected])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false
    let rafId = null
    let avatarRecord = null

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1

    const width = canvas.clientWidth || 220
    const height = canvas.clientHeight || 240
    renderer.setSize(width, height, false)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, width / Math.max(1, height), 0.1, 15)
    camera.position.set(0, 1.02, 2.45)
    camera.lookAt(0, 0.9, 0)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1e1b4b, 1.5)
    scene.add(hemi)

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 0.95)
    keyLight.position.set(0.8, 2.4, 2.6)
    scene.add(keyLight)

    const accentHex = CHARACTER_CATALOG[characterKey]?.accentColor || '#39c5bb'
    const rimLight = new THREE.DirectionalLight(accentHex, 1.35)
    rimLight.position.set(-1.5, 2.2, -1.5)
    scene.add(rimLight)

    const pedestalGeo = new THREE.CylinderGeometry(0.55, 0.62, 0.08, 24)
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x181f36,
      roughness: 0.4,
      metalness: 0.5,
    })
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat)
    pedestal.position.y = -0.04
    scene.add(pedestal)

    loadCharacterAvatar(characterKey).then((record) => {
      if (disposed) {
        disposeAvatarRecord(record)
        return
      }
      avatarRecord = record
      avatarRef.current = record
      record.animationState = isSelected ? 'singing' : 'idle'
      scene.add(record.rootGroup)
      setStatus({
        loading: false,
        isPlaceholder: record.isPlaceholder,
        missingFile: record.missingFile,
      })
    })

    // Smooth 30 FPS rotation preview loop
    let lastFrameMs = performance.now()
    const frameIntervalMs = 1000 / 30
    const startMs = lastFrameMs

    const animate = (nowMs) => {
      if (disposed) return
      rafId = requestAnimationFrame(animate)

      const dtMs = nowMs - lastFrameMs
      if (dtMs < frameIntervalMs) return
      lastFrameMs = nowMs

      const deltaSec = Math.min(dtMs / 1000, 0.1)
      const elapsedSec = (nowMs - startMs) / 1000

      if (avatarRecord) {
        avatarRecord.baseRotationY = Math.sin(elapsedSec * 0.75) * 0.55
        updateAvatarAnimationFrame(avatarRecord, deltaSec, elapsedSec)
      }

      renderer.render(scene, camera)
    }

    rafId = requestAnimationFrame(animate)

    return () => {
      disposed = true
      avatarRef.current = null
      if (rafId) cancelAnimationFrame(rafId)
      if (avatarRecord) disposeAvatarRecord(avatarRecord)
      pedestalGeo.dispose()
      pedestalMat.dispose()
      renderer.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterKey])

  return (
    <div className="character-preview-canvas-wrap">
      <canvas ref={canvasRef} className="character-preview-canvas" />
      {status.loading && <span className="preview-loading-tag">Loading VRM...</span>}
      {!status.loading && status.isPlaceholder && (
        <span className="preview-missing-badge" title={`Missing file: ${status.missingFile}`}>
          <IoWarningOutline /> Stub Primitive ({status.missingFile})
        </span>
      )}
    </div>
  )
}

export default function CharacterSelectModal({
  displayName,
  roomCode,
  isJoining,
  selectedCharacter,
  onSelectCharacter,
  onConfirm,
  onBack,
}) {
  useEffect(() => {
    preloadAvatarAssets()
  }, [])

  const characters = [CHARACTER_CATALOG.miku, CHARACTER_CATALOG.teto]

  return (
    <div className="character-select-modal animated-fade-in" role="dialog" aria-modal="true" aria-labelledby="char-select-heading">
      <div className="character-select-header">
        <span className="step-pill">
          <IoSparklesSharp /> 3D Stage Avatar Select
        </span>
        <h2 id="char-select-heading">Choose Your Stage Performer</h2>
        <p className="character-select-sub">
          Joining as <strong>{displayName}</strong>
          {isJoining && roomCode ? (
            <>
              {' '}
              into Room <strong>{roomCode.toUpperCase()}</strong>
            </>
          ) : (
            ' (Creating New Room)'
          )}
        </p>
      </div>

      <div className="character-cards-grid">
        {characters.map((char) => {
          const isSelected = selectedCharacter === char.id
          return (
            <div
              key={char.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              className={`character-card ${isSelected ? 'selected' : ''} char-${char.id}`}
              onClick={() => onSelectCharacter(char.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectCharacter(char.id)
                }
              }}
            >
              <div className="character-card-top">
                <span className="character-code-badge" style={{ borderColor: char.accentColor, color: char.accentColor }}>
                  {char.subtitle}
                </span>
                {isSelected && (
                  <span className="character-selected-icon" style={{ color: char.accentColor }}>
                    <IoCheckmarkCircle /> Selected
                  </span>
                )}
              </div>

              <CharacterPreviewCanvas characterKey={char.id} isSelected={isSelected} />

              <div className="character-card-info">
                <h3>{char.name}</h3>
                <p className="character-model-path">{char.publicPath}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="character-select-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary btn-glow"
          onClick={() => onConfirm(selectedCharacter)}
        >
          {isJoining ? `Enter 3D Room (${selectedCharacter.toUpperCase()})` : `Create 3D Room (${selectedCharacter.toUpperCase()})`}
        </button>
      </div>
    </div>
  )
}
