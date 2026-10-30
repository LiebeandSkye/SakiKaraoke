/**
 * Bottom-center Roblox-style numbered tool hotbar.
 * Slot 1 holds the first drink tool; picking up additional drinks adds slots 2, 3, etc.
 * Clicking a slot or pressing its number key (1, 2, 3...) equips the drink and takes a sip.
 */
export default function DrinkHotbar({
  inventory = [],
  equippedIndex = null,
  isSipping = false,
  onSelectSlot,
  onPlaceEquipped,
  onUnequip,
}) {
  const equippedItem = equippedIndex !== null ? inventory[equippedIndex] : null

  return (
    <div className="drink-hotbar-wrap" role="toolbar" aria-label="Drink Tools Hotbar">
      {equippedItem && (
        <div className="drink-hotbar-actions">
          <button
            type="button"
            className="drink-action-pill sip-pill"
            onClick={() => onSelectSlot?.(equippedIndex)}
            disabled={isSipping}
          >
            {isSipping ? '🍹 Sipping…' : `🍹 Drink (${equippedItem.sips}/${equippedItem.maxSips || 3}) [${equippedIndex + 1}]`}
          </button>
          <button
            type="button"
            className="drink-action-pill place-pill"
            onClick={() => onPlaceEquipped?.()}
            title="Place this drink on a nearby table or bar counter (Key F)"
          >
            Place on Table <kbd>F</kbd>
          </button>
          <button
            type="button"
            className="drink-action-pill unequip-pill"
            onClick={() => onUnequip?.()}
            title="Put drink away"
          >
            Holster
          </button>
        </div>
      )}

      <div className="drink-hotbar-slots">
        {inventory.length === 0 ? (
          <div className="drink-slot is-empty" title="Slot 1 — Grab or mix a juice at the bar!">
            <span className="drink-slot-num">1</span>
            <span className="drink-slot-empty-icon">🍹</span>
            <span className="drink-slot-name">Empty</span>
          </div>
        ) : (
          inventory.map((item, idx) => {
            const isEquipped = idx === equippedIndex
            const sipsPct = Math.max(0, Math.min(100, ((item.sips ?? 3) / (item.maxSips ?? 3)) * 100))
            return (
              <button
                key={item.id || `${item.drinkKey}-${idx}`}
                type="button"
                className={`drink-slot ${isEquipped ? 'is-equipped' : ''} ${isEquipped && isSipping ? 'is-sipping' : ''}`}
                style={{ '--slot-color': item.color || '#35d6c9' }}
                onClick={() => onSelectSlot?.(idx)}
                title={`${item.name} — Click or press ${idx + 1} to equip & drink (${item.sips}/${item.maxSips || 3} sips left)`}
              >
                <span className="drink-slot-num">{idx + 1}</span>
                <div className="drink-slot-cup">
                  <span
                    className="drink-slot-liquid"
                    style={{
                      height: `${sipsPct}%`,
                      background: item.color || '#35d6c9',
                    }}
                  />
                  <span className="drink-slot-emoji">{item.emoji || '🍹'}</span>
                </div>
                <span className="drink-slot-name">{item.name}</span>
                <div className="drink-slot-sips-bar">
                  <span style={{ width: `${sipsPct}%`, background: item.color || '#35d6c9' }} />
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
