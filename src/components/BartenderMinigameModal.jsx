import { useState, useEffect, useRef, useCallback } from 'react'
import {
  DRINK_LIST,
  INGREDIENT_LIST,
  INGREDIENTS,
  POUR_TARGET,
  REQUIRED_SHAKES,
  createMinigameSession,
  stepMinigameIngredient,
  evaluatePour,
  stepMinigameShake,
} from '../shared/barSystem.js'
import { IoWine, IoClose, IoSparkles, IoCheckmarkCircle, IoExitOutline } from 'react-icons/io5'

export default function BartenderMinigameModal({
  open,
  onClose,
  onLeaveBartender,
  onServeToBar,
  onKeepInHotbar,
  tableDrinksCount = 0,
}) {
  const [selectedKey, setSelectedKey] = useState(DRINK_LIST[0].key)
  const [session, setSession] = useState(() => createMinigameSession(DRINK_LIST[0].key))
  const [feedback, setFeedback] = useState('Pick the recipe ingredients in order!')
  const [wrongFlash, setWrongFlash] = useState(false)
  const [pouring, setPouring] = useState(false)
  const [livePour, setLivePour] = useState(0)
  const [shakingAnim, setShakingAnim] = useState(false)

  const pourRafRef = useRef(0)
  const pourValueRef = useRef(0)
  const lastPourMsRef = useRef(0)

  const selectDrink = useCallback((drinkKey) => {
    cancelAnimationFrame(pourRafRef.current)
    setPouring(false)
    setLivePour(0)
    pourValueRef.current = 0
    setSelectedKey(drinkKey)
    setSession(createMinigameSession(drinkKey))
    setFeedback('Step 1: Add the 4 ingredients in order!')
  }, [])

  const handleIngredientClick = (ingId) => {
    if (session.stage !== 'ingredients') return
    const res = stepMinigameIngredient(session, ingId)
    setSession(res.session)
    if (!res.accepted) {
      const exp = INGREDIENTS[res.expected]
      setWrongFlash(true)
      setFeedback(`Oops! Add ${exp?.emoji || ''} ${exp?.name || 'next ingredient'} next!`)
      setTimeout(() => setWrongFlash(false), 380)
      return
    }
    if (res.completedStage) {
      setFeedback('Step 2: Hold POUR (or Space) and release inside the golden zone!')
    } else {
      const nextIng = INGREDIENTS[res.session.recipe.ingredients[res.session.addedIngredients.length]]
      setFeedback(`Nice! Next: ${nextIng.emoji} ${nextIng.name}`)
    }
  }

  const startPour = useCallback(() => {
    if (session.stage !== 'pour' || pouring) return
    setPouring(true)
    pourValueRef.current = 0
    setLivePour(0)
    lastPourMsRef.current = performance.now()

    const tick = (now) => {
      const dt = Math.min(0.05, (now - lastPourMsRef.current) / 1000)
      lastPourMsRef.current = now
      pourValueRef.current = Math.min(1, pourValueRef.current + dt * 0.56)
      setLivePour(pourValueRef.current)
      if (pourValueRef.current >= 0.99) {
        setPouring(false)
        const res = evaluatePour(session, 1)
        setSession(res.session)
        setLivePour(0)
        pourValueRef.current = 0
        setFeedback('Overfilled! Try pouring again and release in the target zone.')
        return
      }
      pourRafRef.current = requestAnimationFrame(tick)
    }
    pourRafRef.current = requestAnimationFrame(tick)
  }, [pouring, session])

  const finishPour = useCallback(() => {
    if (!pouring || session.stage !== 'pour') return
    cancelAnimationFrame(pourRafRef.current)
    setPouring(false)
    const res = evaluatePour(session, pourValueRef.current)
    setSession(res.session)
    if (!res.success) {
      setLivePour(0)
      pourValueRef.current = 0
      setWrongFlash(true)
      setFeedback(
        res.rating === 'spilled'
          ? 'Spilled over! Hold & release inside the golden zone.'
          : 'Not enough juice! Hold a little longer to reach the zone.',
      )
      setTimeout(() => setWrongFlash(false), 380)
      return
    }
    const label = res.rating === 'perfect' ? 'PERFECT POUR! ★' : res.rating === 'great' ? 'GREAT POUR!' : 'GOOD POUR!'
    setFeedback(`${label} Step 3: Shake ${REQUIRED_SHAKES} times to blend & chill!`)
  }, [pouring, session])

  const handleShake = useCallback(() => {
    if (session.stage !== 'shake') return
    setShakingAnim(true)
    setTimeout(() => setShakingAnim(false), 140)
    const res = stepMinigameShake(session)
    setSession(res.session)
    if (res.completed) {
      setFeedback(`${res.session.recipe.name} is ready to serve!`)
    } else {
      setFeedback(`Keep shaking! (${res.session.shakes}/${REQUIRED_SHAKES})`)
    }
  }, [session])

  // Keyboard support inside the modal (Space for pouring & shaking, Escape to close)
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        onClose?.()
      } else if (e.code === 'Space') {
        e.preventDefault()
        if (session.stage === 'pour' && !e.repeat) startPour()
        else if (session.stage === 'shake' && !e.repeat) handleShake()
      }
    }
    const onKeyUp = (e) => {
      if (e.code === 'Space' && session.stage === 'pour') {
        e.preventDefault()
        finishPour()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [open, session.stage, startPour, finishPour, handleShake, onClose])

  useEffect(() => () => cancelAnimationFrame(pourRafRef.current), [])

  if (!open) return null

  const { recipe, stage, addedIngredients, shakes, quality } = session
  const fillPct =
    stage === 'ingredients'
      ? (addedIngredients.length / recipe.ingredients.length) * 45
      : stage === 'pour'
        ? Math.max(45, livePour * 100)
        : (session.pourLevel || 0.82) * 100

  return (
    <div className="tv-modal-backdrop bartender-backdrop" onClick={onClose}>
      <div className="bartender-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Juice Bar Mixer">
        <div className="tv-modal-header bartender-header">
          <div className="tv-modal-title">
            <IoWine />
            <span>Saki Juice Bar · Bartender Station</span>
          </div>
          <span className="bartender-counter-badge">{tableDrinksCount} on counter/tables</span>
          <button
            type="button"
            className="bartender-leave-btn"
            onClick={() => {
              onLeaveBartender?.()
              onClose?.()
            }}
            title="Step off bartender role so another player can bartend"
          >
            <IoExitOutline /> Step Off Bar
          </button>
          <button type="button" className="tv-modal-close" onClick={onClose} aria-label="Close mixer">
            <IoClose />
          </button>
        </div>

        <div className="bartender-body">
          {/* Left column: Drink Menu */}
          <div className="bartender-menu">
            <div className="bartender-section-label">1. Select Signature Juice</div>
            <div className="bartender-drink-list">
              {DRINK_LIST.map((d) => {
                const active = d.key === selectedKey
                return (
                  <button
                    key={d.key}
                    type="button"
                    className={`bartender-drink-card ${active ? 'active' : ''}`}
                    style={{ '--drink-color': d.color }}
                    onClick={() => selectDrink(d.key)}
                  >
                    <span className="bartender-drink-swatch" style={{ background: d.color }} />
                    <div className="bartender-drink-meta">
                      <strong>
                        {d.emoji} {d.name}
                      </strong>
                      <small>{d.subtitle}</small>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Center/Right column: Interactive Mixing Stage */}
          <div className="bartender-stage">
            <div className="bartender-steps-bar">
              <span className={stage === 'ingredients' ? 'active' : 'done'}>1. Prep Fruit</span>
              <span className={stage === 'pour' ? 'active' : stage === 'shake' || stage === 'done' ? 'done' : ''}>
                2. Precision Pour
              </span>
              <span className={stage === 'shake' ? 'active' : stage === 'done' ? 'done' : ''}>3. Shake & Chill</span>
              <span className={stage === 'done' ? 'active done' : ''}>4. Serve!</span>
            </div>

            <div className={`bartender-workstation ${wrongFlash ? 'shake-error' : ''}`}>
              {/* Visual Glass / Shaker preview */}
              <div className="bartender-shaker-wrap">
                <div
                  className={`bartender-glass ${shakingAnim ? 'is-shaking' : ''} ${stage === 'done' ? 'is-ready' : ''}`}
                  style={{ '--drink-color': recipe.color, '--straw-color': recipe.strawColor }}
                >
                  <div className="bartender-straw" />
                  {stage === 'pour' && (
                    <div
                      className="bartender-target-zone"
                      style={{
                        bottom: `${POUR_TARGET.min * 100}%`,
                        height: `${(POUR_TARGET.max - POUR_TARGET.min) * 100}%`,
                      }}
                    >
                      <span>SWEET SPOT</span>
                    </div>
                  )}
                  <div
                    className="bartender-liquid"
                    style={{
                      height: `${Math.min(100, fillPct)}%`,
                      background: `linear-gradient(180deg, ${recipe.rimColor || '#fff'} 0%, ${recipe.color} 28%, ${recipe.color} 100%)`,
                    }}
                  />
                  <div className="bartender-glass-Added">
                    {addedIngredients.map((id, i) => (
                      <span key={`${id}-${i}`} className="bartender-floating-ing">
                        {INGREDIENTS[id]?.emoji}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bartender-drink-title">
                  <h3>
                    {recipe.emoji} {recipe.name}
                  </h3>
                  <p className="bartender-feedback">{feedback}</p>
                </div>
              </div>

              {/* Recipe checklist */}
              <div className="bartender-recipe-strip">
                {recipe.ingredients.map((id, idx) => {
                  const ing = INGREDIENTS[id]
                  const done = idx < addedIngredients.length
                  const current = stage === 'ingredients' && idx === addedIngredients.length
                  return (
                    <div
                      key={`${id}-${idx}`}
                      className={`bartender-recipe-pill ${done ? 'done' : ''} ${current ? 'current' : ''}`}
                    >
                      <span>{ing.emoji}</span>
                      <span>{ing.name}</span>
                      {done && <IoCheckmarkCircle className="pill-check" />}
                    </div>
                  )
                })}
              </div>

              {/* Stage-specific interactive controls */}
              {stage === 'ingredients' && (
                <div className="bartender-bins">
                  {INGREDIENT_LIST.map((ing) => (
                    <button
                      key={ing.id}
                      type="button"
                      className="bartender-bin-btn"
                      style={{ '--ing-color': ing.color }}
                      onClick={() => handleIngredientClick(ing.id)}
                    >
                      <span className="bin-emoji">{ing.emoji}</span>
                      <span className="bin-name">{ing.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {stage === 'pour' && (
                <div className="bartender-action-box">
                  <button
                    type="button"
                    className={`bartender-big-btn pour-btn ${pouring ? 'is-pouring' : ''}`}
                    onPointerDown={startPour}
                    onPointerUp={finishPour}
                    onPointerLeave={pouring ? finishPour : undefined}
                  >
                    {pouring ? `POURING… ${Math.round(livePour * 100)}% (RELEASE IN ZONE!)` : 'HOLD TO POUR JUICE (or Hold Space)'}
                  </button>
                </div>
              )}

              {stage === 'shake' && (
                <div className="bartender-action-box">
                  <div className="bartender-shake-progress">
                    <div style={{ width: `${(shakes / REQUIRED_SHAKES) * 100}%` }} />
                  </div>
                  <button type="button" className="bartender-big-btn shake-btn" onClick={handleShake}>
                    🧊 SHAKE MIXER! ({shakes} / {REQUIRED_SHAKES}) — Tap or Space
                  </button>
                </div>
              )}

              {stage === 'done' && (
                <div className="bartender-serve-box">
                  <div className="bartender-stars">
                    <IoSparkles /> Crafted Quality: {'★'.repeat(quality)}
                    {'☆'.repeat(3 - quality)}
                  </div>
                  <div className="bartender-serve-actions">
                    <button
                      type="button"
                      className="bartender-serve-btn primary"
                      onClick={() => {
                        onServeToBar?.({ drinkKey: recipe.key, quality })
                        selectDrink(recipe.key)
                      }}
                    >
                      🍹 Place on Bar Counter (For Room)
                    </button>
                    <button
                      type="button"
                      className="bartender-serve-btn secondary"
                      onClick={() => {
                        onKeepInHotbar?.({
                          drinkKey: recipe.key,
                          name: recipe.name,
                          emoji: recipe.emoji,
                          color: recipe.color,
                          rimColor: recipe.rimColor,
                          strawColor: recipe.strawColor,
                          quality,
                          sips: recipe.sips,
                          maxSips: recipe.sips,
                        })
                        selectDrink(recipe.key)
                      }}
                    >
                      🎒 Take to Slot 1 (My Hotbar)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
