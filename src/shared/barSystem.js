/**
 * Shared definitions and pure state machines for:
 * - Bar drink recipes & ingredients
 * - 3-stage Bartender juice-making minigame
 * - Room seats (back sofa: 4 seats, right sofa: 3 seats, bar stools: 4 seats)
 * - Bar counter & coffee table drink placement slots
 * - Contextual proximity interactions (Sit, Bartend, Take Drink, Place Drink, Open TV)
 */

export const INGREDIENTS = {
  orange: { id: 'orange', name: 'Fresh Orange', emoji: '🍊', color: '#ff922b' },
  lime: { id: 'lime', name: 'Zesty Lime', emoji: '🍋‍🟩', color: '#51cf66' },
  strawberry: { id: 'strawberry', name: 'Ruby Berry', emoji: '🍓', color: '#ff4d6d' },
  mango: { id: 'mango', name: 'Golden Mango', emoji: '🥭', color: '#fcc419' },
  grape: { id: 'grape', name: 'Kyoho Grape', emoji: '🍇', color: '#9d65ff' },
  melon: { id: 'melon', name: 'Cyan Melon', emoji: '🍈', color: '#35d6c9' },
  matcha: { id: 'matcha', name: 'Uji Matcha', emoji: '🍵', color: '#52b788' },
  peach: { id: 'peach', name: 'Sakura Peach', emoji: '🍑', color: '#ff8fab' },
  honey: { id: 'honey', name: 'Starlight Syrup', emoji: '🍯', color: '#ffd43b' },
  ice: { id: 'ice', name: 'Crushed Ice', emoji: '🧊', color: '#a5f3fc' },
}

export const INGREDIENT_LIST = Object.values(INGREDIENTS)

export const DRINK_CATALOG = {
  miku_fizz: {
    key: 'miku_fizz',
    name: 'Miku Cyan Fizz',
    subtitle: 'Electric melon & lime spritzer',
    emoji: '🍹',
    color: '#35d6c9',
    rimColor: '#b8fff9',
    strawColor: '#ff6f61',
    ingredients: ['melon', 'lime', 'honey', 'ice'],
    sips: 3,
  },
  teto_berry: {
    key: 'teto_berry',
    name: 'Teto Berry Drill',
    subtitle: 'Sweet double-berry & peach punch',
    emoji: '🍓',
    color: '#ff4d6d',
    rimColor: '#ffd6de',
    strawColor: '#ffb14a',
    ingredients: ['strawberry', 'peach', 'honey', 'ice'],
    sips: 3,
  },
  golden_encore: {
    key: 'golden_encore',
    name: 'Golden Encore Sunrise',
    subtitle: 'Tropical mango-orange high-note fuel',
    emoji: '🌅',
    color: '#ffb14a',
    rimColor: '#fff1c2',
    strawColor: '#ff4d6d',
    ingredients: ['mango', 'orange', 'peach', 'honey'],
    sips: 3,
  },
  midnight_grape: {
    key: 'midnight_grape',
    name: 'Midnight Velvet Grape',
    subtitle: 'Smooth dark grape & berry cooler',
    emoji: '🍇',
    color: '#9d65ff',
    rimColor: '#e3d1ff',
    strawColor: '#35d6c9',
    ingredients: ['grape', 'strawberry', 'lime', 'ice'],
    sips: 3,
  },
  matcha_cooler: {
    key: 'matcha_cooler',
    name: 'Matcha Harmony Tonic',
    subtitle: 'Earthy Uji matcha with zesty lime',
    emoji: '🍵',
    color: '#52b788',
    rimColor: '#d8f3dc',
    strawColor: '#e9dcc2',
    ingredients: ['matcha', 'lime', 'honey', 'ice'],
    sips: 3,
  },
  sakura_peach: {
    key: 'sakura_peach',
    name: 'Sakura Peach Sparkle',
    subtitle: 'Floral peach & citrus blush',
    emoji: '🌸',
    color: '#ff8fab',
    rimColor: '#ffe5ec',
    strawColor: '#fff0d6',
    ingredients: ['peach', 'strawberry', 'orange', 'ice'],
    sips: 3,
  },
}

export const DRINK_LIST = Object.values(DRINK_CATALOG)

/**
 * Bartender station behind the left-wall bar counter.
 * Bartender stands behind the counter at (-4.22, -0.6) facing +X (toward bar stools & room).
 */
export const BARTENDER_STATION = {
  x: -4.22,
  z: -0.6,
  yaw: Math.PI / 2,
  interactRadius: 1.45,
  // Bartender station triggers behind the bar counter or at the north/south bar entryways
  triggerPoints: [
    { x: -4.22, z: -0.6 },
    { x: -4.0, z: -2.2 },
    { x: -4.0, z: 1.1 },
  ],
}

/**
 * Room seats calculated from exact sofa & bar stool dimensions in roomBuilder.js:
 * - Back-wall sofa (length 4.6m at x=1.0, z=3.5): 4 cushions (1.05m each)
 * - Right-wall sofa (length 3.8m at x=4.5, z=-0.4): 3 cushions (1.133m each)
 * - Left-wall bar stools (4 stools at x=-2.65, z=[-2.1, -1.2, -0.3, 0.6])
 */
export const ROOM_SEATS = [
  // Back-wall sofa (faces -Z toward TV, yaw = Math.PI)
  { id: 'sofa-back-0', group: 'Back Sofa', label: 'Sofa', x: -0.575, y: 0.52, sitRootY: -0.18, z: 3.38, yaw: Math.PI, standX: -0.575, standZ: 2.65 },
  { id: 'sofa-back-1', group: 'Back Sofa', label: 'Sofa', x: 0.475, y: 0.52, sitRootY: -0.18, z: 3.38, yaw: Math.PI, standX: 0.475, standZ: 2.65 },
  { id: 'sofa-back-2', group: 'Back Sofa', label: 'Sofa', x: 1.525, y: 0.52, sitRootY: -0.18, z: 3.38, yaw: Math.PI, standX: 1.525, standZ: 2.65 },
  { id: 'sofa-back-3', group: 'Back Sofa', label: 'Sofa', x: 2.575, y: 0.52, sitRootY: -0.18, z: 3.38, yaw: Math.PI, standX: 2.575, standZ: 2.65 },

  // Right-wall sectional sofa (faces -X toward room/bar, yaw = -Math.PI / 2)
  { id: 'sofa-right-0', group: 'Lounge Sofa', label: 'Sofa', x: 4.38, y: 0.52, sitRootY: -0.18, z: 0.733, yaw: -Math.PI / 2, standX: 3.65, standZ: 0.733 },
  { id: 'sofa-right-1', group: 'Lounge Sofa', label: 'Sofa', x: 4.38, y: 0.52, sitRootY: -0.18, z: -0.4, yaw: -Math.PI / 2, standX: 3.65, standZ: -0.4 },
  { id: 'sofa-right-2', group: 'Lounge Sofa', label: 'Sofa', x: 4.38, y: 0.52, sitRootY: -0.18, z: -1.533, yaw: -Math.PI / 2, standX: 3.65, standZ: -1.533 },

  // Bar stools (face -X toward the bar counter & bartender, yaw = -Math.PI / 2)
  { id: 'stool-0', group: 'Bar Stool', label: 'Bar Stool', x: -2.65, y: 0.68, sitRootY: -0.02, z: -2.1, yaw: -Math.PI / 2, standX: -2.05, standZ: -2.1 },
  { id: 'stool-1', group: 'Bar Stool', label: 'Bar Stool', x: -2.65, y: 0.68, sitRootY: -0.02, z: -1.2, yaw: -Math.PI / 2, standX: -2.05, standZ: -1.2 },
  { id: 'stool-2', group: 'Bar Stool', label: 'Bar Stool', x: -2.65, y: 0.68, sitRootY: -0.02, z: -0.3, yaw: -Math.PI / 2, standX: -2.05, standZ: -0.3 },
  { id: 'stool-3', group: 'Bar Stool', label: 'Bar Stool', x: -2.65, y: 0.68, sitRootY: -0.02, z: 0.6, yaw: -Math.PI / 2, standX: -2.05, standZ: 0.6 },
]

export const SEAT_MAP = new Map(ROOM_SEATS.map((s) => [s.id, s]))

/**
 * Surfaces where drinks can be placed & picked up by players:
 * - 6 coasters along the oak Bar Counter top (y = 1.06m)
 * - 4 spots on the Back Sofa Coffee Table (x=1.0, z=2.05, y=0.425m)
 * - 4 spots on the Right Sofa Coffee Table (x=3.05, z=-0.4, y=0.425m)
 */
export const TABLE_SLOTS = [
  // Bar counter serving slots
  { id: 'bar-0', surface: 'bar', label: 'Bar Counter', x: -3.22, y: 1.06, z: -2.1 },
  { id: 'bar-1', surface: 'bar', label: 'Bar Counter', x: -3.22, y: 1.06, z: -1.5 },
  { id: 'bar-2', surface: 'bar', label: 'Bar Counter', x: -3.22, y: 1.06, z: -0.9 },
  { id: 'bar-3', surface: 'bar', label: 'Bar Counter', x: -3.22, y: 1.06, z: -0.3 },
  { id: 'bar-4', surface: 'bar', label: 'Bar Counter', x: -3.22, y: 1.06, z: 0.3 },
  { id: 'bar-5', surface: 'bar', label: 'Bar Counter', x: -3.22, y: 1.06, z: 0.9 },

  // Coffee table in front of back sofa
  { id: 'table-back-0', surface: 'table', label: 'Coffee Table', x: 0.48, y: 0.425, z: 1.88 },
  { id: 'table-back-1', surface: 'table', label: 'Coffee Table', x: 0.88, y: 0.425, z: 2.2 },
  { id: 'table-back-2', surface: 'table', label: 'Coffee Table', x: 1.22, y: 0.425, z: 1.88 },
  { id: 'table-back-3', surface: 'table', label: 'Coffee Table', x: 1.52, y: 0.425, z: 2.2 },

  // Coffee table in front of right sofa
  { id: 'table-right-0', surface: 'table', label: 'Side Table', x: 2.88, y: 0.425, z: -0.92 },
  { id: 'table-right-1', surface: 'table', label: 'Side Table', x: 3.22, y: 0.425, z: -0.58 },
  { id: 'table-right-2', surface: 'table', label: 'Side Table', x: 2.88, y: 0.425, z: -0.22 },
  { id: 'table-right-3', surface: 'table', label: 'Side Table', x: 3.22, y: 0.425, z: 0.12 },
]

export const TABLE_SLOT_MAP = new Map(TABLE_SLOTS.map((s) => [s.id, s]))

// ---------- Bartender Minigame State Machine ----------

export const POUR_TARGET = { min: 0.72, max: 0.9, perfectMin: 0.77, perfectMax: 0.85 }
export const REQUIRED_SHAKES = 6

export function createMinigameSession(drinkKey = 'miku_fizz') {
  const recipe = DRINK_CATALOG[drinkKey] || DRINK_CATALOG.miku_fizz
  return {
    drinkKey: recipe.key,
    recipe,
    stage: 'ingredients', // 'ingredients' | 'pour' | 'shake' | 'done'
    addedIngredients: [],
    mistakes: 0,
    pourLevel: 0,
    pourScore: 0, // 1 = ok, 2 = good, 3 = perfect
    shakes: 0,
    quality: 3,
  }
}

export function stepMinigameIngredient(session, ingredientId) {
  if (!session || session.stage !== 'ingredients') {
    return { session, accepted: false, error: 'Not in ingredient stage' }
  }
  const expected = session.recipe.ingredients[session.addedIngredients.length]
  if (ingredientId !== expected) {
    return {
      session: { ...session, mistakes: session.mistakes + 1 },
      accepted: false,
      expected,
    }
  }
  const addedIngredients = [...session.addedIngredients, ingredientId]
  const doneIngredients = addedIngredients.length >= session.recipe.ingredients.length
  return {
    session: {
      ...session,
      addedIngredients,
      stage: doneIngredients ? 'pour' : 'ingredients',
    },
    accepted: true,
    completedStage: doneIngredients,
  }
}

export function evaluatePour(session, level) {
  if (!session || session.stage !== 'pour') {
    return { session, success: false }
  }
  const clamped = Math.max(0, Math.min(1, Number(level) || 0))
  if (clamped < 0.45 || clamped > 0.96) {
    // Underfilled or spilled over — let the bartender retry the pour
    return {
      session: { ...session, pourLevel: 0, mistakes: session.mistakes + 1 },
      success: false,
      rating: clamped > 0.96 ? 'spilled' : 'too-low',
    }
  }
  let pourScore = 1
  let rating = 'good'
  if (clamped >= POUR_TARGET.perfectMin && clamped <= POUR_TARGET.perfectMax) {
    pourScore = 3
    rating = 'perfect'
  } else if (clamped >= POUR_TARGET.min && clamped <= POUR_TARGET.max) {
    pourScore = 2
    rating = 'great'
  }
  return {
    session: {
      ...session,
      pourLevel: clamped,
      pourScore,
      stage: 'shake',
    },
    success: true,
    rating,
  }
}

export function stepMinigameShake(session) {
  if (!session || session.stage !== 'shake') {
    return { session, completed: false }
  }
  const shakes = Math.min(REQUIRED_SHAKES, session.shakes + 1)
  const completed = shakes >= REQUIRED_SHAKES
  const penalty = session.mistakes >= 3 ? 1 : 0
  const baseStars = session.pourScore >= 2 ? 3 : 2
  const quality = Math.max(1, Math.min(3, baseStars - penalty))
  return {
    session: {
      ...session,
      shakes,
      quality,
      stage: completed ? 'done' : 'shake',
    },
    completed,
  }
}

// ---------- Proximity & Interaction Helpers ----------

export function findNearestAvailableSeat(px, pz, occupiedSeats = {}, myId = null, maxDist = 1.28) {
  let best = null
  let bestDist = maxDist
  for (const seat of ROOM_SEATS) {
    const holder = occupiedSeats[seat.id]
    if (holder && holder !== myId) continue
    const d = Math.hypot(px - seat.x, pz - seat.z)
    if (d <= bestDist) {
      bestDist = d
      best = seat
    }
  }
  return best ? { seat: best, dist: bestDist } : null
}

export function findNearestTableDrink(px, pz, tableDrinks = [], maxDist = 1.38) {
  let best = null
  let bestDist = maxDist
  for (const drink of tableDrinks) {
    const slot = TABLE_SLOT_MAP.get(drink.slotId)
    const dx = px - (slot ? slot.x : drink.x || 0)
    const dz = pz - (slot ? slot.z : drink.z || 0)
    const d = Math.hypot(dx, dz)
    if (d <= bestDist) {
      bestDist = d
      best = { drink, slot, dist: d }
    }
  }
  return best
}

export function findNearestFreeTableSlot(px, pz, tableDrinks = [], preferredSurface = null, maxDist = 1.65) {
  const used = new Set(tableDrinks.map((d) => d.slotId))
  let best = null
  let bestDist = maxDist
  for (const slot of TABLE_SLOTS) {
    if (used.has(slot.id)) continue
    if (preferredSurface && slot.surface !== preferredSurface) continue
    const d = Math.hypot(px - slot.x, pz - slot.z)
    if (d <= bestDist) {
      bestDist = d
      best = { slot, dist: d }
    }
  }
  return best
}

export function isNearBartenderStation(px, pz) {
  for (const pt of BARTENDER_STATION.triggerPoints) {
    if (Math.hypot(px - pt.x, pz - pt.z) <= 1.15) return true
  }
  return Math.hypot(px - BARTENDER_STATION.x, pz - BARTENDER_STATION.z) <= BARTENDER_STATION.interactRadius
}

/**
 * Determines what holding `E` will do at the player's current position.
 */
export function resolveHoldInteraction({
  px,
  pz,
  myId,
  sittingSeatId = null,
  bartenderId = null,
  bartenderName = 'Someone',
  occupiedSeats = {},
  tableDrinks = [],
  equippedDrink = null,
}) {
  if (sittingSeatId) {
    const seat = SEAT_MAP.get(sittingSeatId)
    return {
      type: 'stand-up',
      seat,
      label: `Hold E — Stand Up (${seat?.group || 'Seat'})`,
    }
  }

  // 1. If standing right at the bartender station behind the bar
  const nearBar = isNearBartenderStation(px, pz)
  if (nearBar && bartenderId === myId) {
    return {
      type: 'open-bartender',
      label: 'Hold E — Mix Juice (Bartender)',
    }
  }

  // 2. Nearby drink on a table or bar counter to pick up
  const nearbyDrink = findNearestTableDrink(px, pz, tableDrinks, 1.32)
  if (nearbyDrink) {
    return {
      type: 'take-drink',
      drink: nearbyDrink.drink,
      slot: nearbyDrink.slot,
      label: `Hold E — Take ${nearbyDrink.drink.name}`,
    }
  }

  // 3. Bartender station claim (if no one is bartending)
  if (nearBar) {
    if (!bartenderId) {
      return {
        type: 'claim-bartender',
        label: 'Hold E — Become Bartender',
      }
    }
    if (bartenderId !== myId) {
      return {
        type: 'bartender-busy',
        label: `Bartender Busy (${bartenderName})`,
      }
    }
  }

  // 4. Nearby empty seat (bar stool or sofa cushion)
  const nearbySeat = findNearestAvailableSeat(px, pz, occupiedSeats, myId, 1.25)
  if (nearbySeat) {
    return {
      type: 'sit',
      seat: nearbySeat.seat,
      label: `Hold E — Sit (${nearbySeat.seat.group})`,
    }
  }

  // 5. If player has an equipped drink and is near a free table/counter slot, allow placing with Hold E
  if (equippedDrink) {
    const freeSlot = findNearestFreeTableSlot(px, pz, tableDrinks, null, 1.45)
    if (freeSlot) {
      return {
        type: 'place-drink',
        slot: freeSlot.slot,
        drink: equippedDrink,
        label: `Hold E — Place ${equippedDrink.name} on ${freeSlot.slot.label}`,
      }
    }
  }

  // 6. Default: open the karaoke TV modal
  return {
    type: 'open-tv',
    label: 'Hold E — Open TV',
  }
}
