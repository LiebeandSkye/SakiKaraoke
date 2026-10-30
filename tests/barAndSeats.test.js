import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DRINK_CATALOG,
  DRINK_LIST,
  ROOM_SEATS,
  TABLE_SLOTS,
  REQUIRED_SHAKES,
  createMinigameSession,
  stepMinigameIngredient,
  evaluatePour,
  stepMinigameShake,
  resolveHoldInteraction,
} from '../src/shared/barSystem.js'
import { createRoomStore } from '../server/roomStore.js'
import { createPlaceholderAvatar, disposeAvatarRecord } from '../src/three/vrmLoader.js'
import { updateAvatarAnimationFrame } from '../src/three/mixamoVRMRigMap.js'

describe('bar minigame, drink placement & seating system', () => {
  it('defines 6 signature drinks and completes the 3-stage juice minigame', () => {
    assert.ok(DRINK_LIST.length >= 6)
    let session = createMinigameSession('miku_fizz')
    assert.equal(session.stage, 'ingredients')

    // Wrong ingredient increments mistakes and stays in ingredients stage
    const wrong = stepMinigameIngredient(session, 'grape')
    assert.equal(wrong.accepted, false)
    assert.equal(wrong.session.mistakes, 1)
    session = wrong.session

    // Add all 4 required ingredients in order
    for (const ing of DRINK_CATALOG.miku_fizz.ingredients) {
      const step = stepMinigameIngredient(session, ing)
      assert.equal(step.accepted, true)
      session = step.session
    }
    assert.equal(session.stage, 'pour')

    // Underfill retries pour
    const low = evaluatePour(session, 0.2)
    assert.equal(low.success, false)
    assert.equal(low.session.stage, 'pour')

    // Perfect pour advances to shake stage
    const pour = evaluatePour(low.session, 0.8)
    assert.equal(pour.success, true)
    assert.equal(pour.rating, 'perfect')
    session = pour.session
    assert.equal(session.stage, 'shake')

    // Shake REQUIRED_SHAKES times to complete the drink
    for (let i = 0; i < REQUIRED_SHAKES; i += 1) {
      const sh = stepMinigameShake(session)
      session = sh.session
      if (i < REQUIRED_SHAKES - 1) assert.equal(sh.completed, false)
      else assert.equal(sh.completed, true)
    }
    assert.equal(session.stage, 'done')
    assert.ok(session.quality >= 2)
  })

  it('provides 4 seats on the back sofa, 3 on the right sofa, and 4 bar stools', () => {
    const backSofa = ROOM_SEATS.filter((s) => s.id.startsWith('sofa-back-'))
    const rightSofa = ROOM_SEATS.filter((s) => s.id.startsWith('sofa-right-'))
    const stools = ROOM_SEATS.filter((s) => s.id.startsWith('stool-'))
    assert.equal(backSofa.length, 4)
    assert.equal(rightSofa.length, 3)
    assert.equal(stools.length, 4)
    assert.ok(TABLE_SLOTS.length >= 12)
  })

  it('enforces single bartender at a time and lets players place and take drinks in roomStore', () => {
    let idSeq = 0
    const store = createRoomStore({
      now: () => 1000,
      makeCode: () => 'BAR123',
      makeId: () => `item-${++idSeq}`,
    })
    store.createRoom({ socketId: 'u1', displayName: 'Saki' })
    store.joinRoom({ roomCode: 'BAR123', socketId: 'u2', displayName: 'Haru' })

    // u1 claims bartender
    const c1 = store.claimBartender({ roomCode: 'BAR123', socketId: 'u1' })
    assert.equal(c1.ok, true)
    assert.equal(c1.room.bartenderId, 'u1')

    // u2 cannot claim while u1 is bartender
    const c2 = store.claimBartender({ roomCode: 'BAR123', socketId: 'u2' })
    assert.equal(c2.ok, false)

    // u1 serves a drink onto the bar counter
    const placed = store.placeDrink({
      roomCode: 'BAR123',
      socketId: 'u1',
      drinkKey: 'teto_berry',
      quality: 3,
      preferredSurface: 'bar',
    })
    assert.equal(placed.ok, true)
    assert.equal(placed.room.tableDrinks.length, 1)
    assert.equal(placed.drink.name, 'Teto Berry Drill')

    // u2 takes the drink from the bar counter
    const taken = store.takeDrink({
      roomCode: 'BAR123',
      socketId: 'u2',
      drinkId: placed.drink.id,
    })
    assert.equal(taken.ok, true)
    assert.equal(taken.drink.drinkKey, 'teto_berry')
    assert.equal(taken.room.tableDrinks.length, 0)

    // Taking the same drink again fails cleanly
    const duplicateTake = store.takeDrink({
      roomCode: 'BAR123',
      socketId: 'u1',
      drinkId: placed.drink.id,
    })
    assert.equal(duplicateTake.ok, false)
  })

  it('allows multiple players to sit on different sofa cushions and prevents seat collision', () => {
    const store = createRoomStore({ now: () => 1000, makeCode: () => 'SIT123' })
    store.createRoom({ socketId: 'u1', displayName: 'Saki' })
    store.joinRoom({ roomCode: 'SIT123', socketId: 'u2', displayName: 'Haru' })
    store.joinRoom({ roomCode: 'SIT123', socketId: 'u3', displayName: 'Miku' })
    store.joinRoom({ roomCode: 'SIT123', socketId: 'u4', displayName: 'Teto' })

    assert.equal(store.sitOnSeat({ roomCode: 'SIT123', socketId: 'u1', seatId: 'sofa-back-0' }).ok, true)
    assert.equal(store.sitOnSeat({ roomCode: 'SIT123', socketId: 'u2', seatId: 'sofa-back-0' }).ok, false)
    assert.equal(store.sitOnSeat({ roomCode: 'SIT123', socketId: 'u2', seatId: 'sofa-back-1' }).ok, true)
    assert.equal(store.sitOnSeat({ roomCode: 'SIT123', socketId: 'u3', seatId: 'sofa-back-2' }).ok, true)
    const fourth = store.sitOnSeat({ roomCode: 'SIT123', socketId: 'u4', seatId: 'sofa-back-3' })
    assert.equal(fourth.ok, true)
    assert.equal(Object.keys(fourth.room.seats).length, 4)

    const stood = store.standFromSeat({ roomCode: 'SIT123', socketId: 'u1' })
    assert.equal(stood.ok, true)
    assert.equal(stood.room.seats['sofa-back-0'], undefined)
  })

  it('resolves contextual Hold-E interactions for seats, bartender station, and placed drinks', () => {
    const nearSeat = resolveHoldInteraction({
      px: -2.6,
      pz: -1.2,
      myId: 'u1',
      occupiedSeats: {},
    })
    assert.equal(nearSeat.type, 'sit')
    assert.equal(nearSeat.seat.id, 'stool-1')

    const nearBar = resolveHoldInteraction({
      px: -4.2,
      pz: -0.6,
      myId: 'u1',
      bartenderId: null,
    })
    assert.equal(nearBar.type, 'claim-bartender')

    const nearDrink = resolveHoldInteraction({
      px: 0.5,
      pz: 1.9,
      myId: 'u1',
      tableDrinks: [{ id: 'd1', name: 'Miku Cyan Fizz', slotId: 'table-back-0' }],
    })
    assert.equal(nearDrink.type, 'take-drink')
  })

  it('animates avatar sitting, holding drink, and sipping states', () => {
    const stub = createPlaceholderAvatar('miku')
    stub.isSitting = true
    stub.heldDrinkKey = 'miku_fizz'
    stub.isSipping = true

    for (let i = 0; i < 30; i += 1) {
      updateAvatarAnimationFrame(stub, 0.05, i * 0.05)
    }
    assert.ok(stub.sitIntensity > 0.9)
    assert.ok(stub.drinkHoldIntensity > 0.9)
    assert.ok(stub.sipIntensity > 0.9)
    assert.equal(stub.props.drink.visible, true)
    disposeAvatarRecord(stub)
  })
})
