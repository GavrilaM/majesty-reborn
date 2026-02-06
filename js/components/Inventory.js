export class Inventory {
    constructor() {
        // Belt: Dedicated consumable slots
        this.belt = {
            potion1: null,  // First HP potion slot
            potion2: null,  // Second HP potion slot
            staminaPotion: null  // Energy/Stamina potion slot (NEW)
            // Future: scroll slot, bomb slot, etc.
        };

        // Future expansions (commented out for now):
        // this.equipment = { weapon: null, armor: null, accessory: null };
        // this.backpack = { slots: Array(6).fill(null), capacity: 6 };
    }

    // === BELT METHODS ===

    /**
     * Add a potion to the first available belt slot
     * @returns {boolean} - True if added, false if belt is full
     */
    addPotion(potion) {
        if (this.belt.potion1 === null) {
            this.belt.potion1 = potion;
            return true;
        } else if (this.belt.potion2 === null) {
            this.belt.potion2 = potion;
            return true;
        }
        return false; // Belt is full (2/2 potions)
    }

    /**
     * Use (remove) one potion from the belt
     * @returns {Object|null} - The potion object, or null if no potions
     */
    usePotion() {
        // Use potion1 first, then potion2
        if (this.belt.potion1) {
            const potion = this.belt.potion1;
            this.belt.potion1 = null;
            return potion;
        } else if (this.belt.potion2) {
            const potion = this.belt.potion2;
            this.belt.potion2 = null;
            return potion;
        }
        return null; // No potions available
    }

    /**
     * Check how many potions are in the belt
     * @returns {number} - Count (0, 1, or 2)
     */
    getPotionCount() {
        let count = 0;
        if (this.belt.potion1) count++;
        if (this.belt.potion2) count++;
        return count;
    }

    /**
     * Check if belt has at least one potion
     * @returns {boolean}
     */
    hasPotion() {
        return this.belt.potion1 !== null || this.belt.potion2 !== null;
    }

    /**
     * Check if belt is full (2/2 potions)
     * @returns {boolean}
     */
    isBeltFull() {
        return this.belt.potion1 !== null && this.belt.potion2 !== null;
    }

    /**
     * Get all potions as an array (for death drops)
     * @returns {Array} - Array of potion objects
     */
    getAllPotions() {
        const potions = [];
        if (this.belt.potion1) potions.push(this.belt.potion1);
        if (this.belt.potion2) potions.push(this.belt.potion2);
        return potions;
    }

    /**
     * Clear all potions (used when dropping on death)
     */
    clearPotions() {
        this.belt.potion1 = null;
        this.belt.potion2 = null;
        this.belt.staminaPotion = null;  // Also clear stamina potion
    }

    // === STAMINA POTION METHODS (NEW) ===

    /**
     * Add a stamina potion to the belt
     * @returns {boolean} - True if added, false if slot is full
     */
    addStaminaPotion(potion) {
        if (this.belt.staminaPotion === null) {
            this.belt.staminaPotion = potion;
            return true;
        }
        return false; // Stamina slot is full
    }

    /**
     * Check if belt has a stamina potion
     * @returns {boolean}
     */
    hasStaminaPotion() {
        return this.belt.staminaPotion !== null;
    }

    /**
     * Use (remove) the stamina potion
     * @returns {Object|null} - The potion object, or null if empty
     */
    useStaminaPotion() {
        if (this.belt.staminaPotion) {
            const potion = this.belt.staminaPotion;
            this.belt.staminaPotion = null;
            return potion;
        }
        return null;
    }
}
