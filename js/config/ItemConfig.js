export const ITEM_CONFIG = {
    POTION: {
        name: "Health Potion",
        type: "CONSUMABLE",
        cost: 30,        // Gold cost at market
        healAmount: 50,  // HP restored
        description: "Restores 50 HP when consumed"
    }
};

// EQUIPMENT SYSTEM
export const EQUIPMENT = {
    // ============ WEAPONS ============
    // WARRIOR WEAPONS
    RUSTY_SWORD: {
        id: 'RUSTY_SWORD',
        name: "Rusty Sword",
        type: "WEAPON",
        weaponType: "SWORD",
        classReq: "WARRIOR",
        tier: 1,
        cost: 0,
        damage: 5,
        crit: 0,
        attackSpeed: 0,
        description: "A worn blade, but still sharp enough."
    },
    IRON_SWORD: {
        id: 'IRON_SWORD',
        name: "Iron Sword",
        type: "WEAPON",
        weaponType: "SWORD",
        classReq: "WARRIOR",
        tier: 2,
        cost: 80,
        damage: 12,
        crit: 0.05,
        attackSpeed: 0,
        description: "Reliable iron blade."
    },
    STEEL_LONGSWORD: {
        id: 'STEEL_LONGSWORD',
        name: "Steel Longsword",
        type: "WEAPON",
        weaponType: "SWORD",
        classReq: "WARRIOR",
        tier: 3,
        cost: 200,
        damage: 22,
        crit: 0.10,
        attackSpeed: 0.05,
        description: "Finely crafted steel blade."
    },
    KNIGHTS_BLADE: {
        id: 'KNIGHTS_BLADE',
        name: "Knight's Blade",
        type: "WEAPON",
        weaponType: "SWORD",
        classReq: "WARRIOR",
        tier: 4,
        cost: 450,
        damage: 35,
        crit: 0.15,
        attackSpeed: 0.10,
        description: "Blade of a true knight."
    },

    // RANGER WEAPONS
    SHORTBOW: {
        id: 'SHORTBOW',
        name: "Shortbow",
        type: "WEAPON",
        weaponType: "BOW",
        classReq: "RANGER",
        tier: 1,
        cost: 0,
        damage: 5,
        crit: 0,
        attackSpeed: 0,
        description: "A simple hunting bow."
    },
    LONGBOW: {
        id: 'LONGBOW',
        name: "Longbow",
        type: "WEAPON",
        weaponType: "BOW",
        classReq: "RANGER",
        tier: 2,
        cost: 80,
        damage: 12,
        crit: 0.05,
        attackSpeed: 0,
        description: "Greater range and power."
    },
    COMPOSITE_BOW: {
        id: 'COMPOSITE_BOW',
        name: "Composite Bow",
        type: "WEAPON",
        weaponType: "BOW",
        classReq: "RANGER",
        tier: 3,
        cost: 200,
        damage: 22,
        crit: 0.10,
        attackSpeed: 0.05,
        description: "Layered construction for power."
    },
    ELVEN_BOW: {
        id: 'ELVEN_BOW',
        name: "Elven Bow",
        type: "WEAPON",
        weaponType: "BOW",
        classReq: "RANGER",
        tier: 4,
        cost: 450,
        damage: 35,
        crit: 0.15,
        attackSpeed: 0.10,
        description: "Masterwork of elven craft."
    },

    // ============ ARMOR ============
    // LIGHT ARMOR (Ranger default)
    CLOTH_RAGS: {
        id: 'CLOTH_RAGS',
        name: "Cloth Rags",
        type: "ARMOR",
        armorType: "LIGHT",
        tier: 1,
        cost: 0,
        defense: 2,
        hp: 0,
        dodge: 0,
        speedMod: 0,
        description: "Better than nothing."
    },
    REINFORCED_LEATHER: {
        id: 'REINFORCED_LEATHER',
        name: "Reinforced Leather",
        type: "ARMOR",
        armorType: "LIGHT",
        tier: 2,
        cost: 80,
        defense: 8,
        hp: 15,
        dodge: 0.05,
        speedMod: 0,
        description: "Flexible and protective."
    },
    RANGERS_GARB: {
        id: 'RANGERS_GARB',
        name: "Ranger's Garb",
        type: "ARMOR",
        armorType: "LIGHT",
        tier: 3,
        cost: 180,
        defense: 15,
        hp: 20,
        dodge: 0.10,
        speedMod: 0.05,
        description: "Made for those who hunt."
    },
    SHADOW_CLOAK: {
        id: 'SHADOW_CLOAK',
        name: "Shadow Cloak",
        type: "ARMOR",
        armorType: "LIGHT",
        tier: 4,
        cost: 400,
        defense: 20,
        hp: 30,
        dodge: 0.20,
        speedMod: 0.10,
        description: "Woven from shadows."
    },

    // MEDIUM ARMOR (Warrior default)
    LEATHER_ARMOR: {
        id: 'LEATHER_ARMOR',
        name: "Leather Armor",
        type: "ARMOR",
        armorType: "MEDIUM",
        tier: 1,
        cost: 0,
        defense: 5,
        hp: 10,
        dodge: 0,
        speedMod: 0,
        description: "Standard protection."
    },
    CHAINMAIL: {
        id: 'CHAINMAIL',
        name: "Chainmail",
        type: "ARMOR",
        armorType: "MEDIUM",
        tier: 2,
        cost: 100,
        defense: 12,
        hp: 25,
        dodge: 0,
        speedMod: -0.05,
        description: "Linked metal rings."
    },
    PLATE_ARMOR: {
        id: 'PLATE_ARMOR',
        name: "Plate Armor",
        type: "ARMOR",
        armorType: "HEAVY",
        tier: 3,
        cost: 250,
        defense: 25,
        hp: 50,
        dodge: 0,
        speedMod: -0.10,
        description: "Full metal protection."
    },
    DRAGON_SCALE: {
        id: 'DRAGON_SCALE',
        name: "Dragon Scale",
        type: "ARMOR",
        armorType: "HEAVY",
        tier: 4,
        cost: 500,
        defense: 40,
        hp: 80,
        dodge: 0,
        speedMod: -0.05,
        resist: 0.10,
        description: "Forged from dragon scales."
    }
};

// Starting equipment by class
export const STARTING_EQUIPMENT = {
    WARRIOR: {
        weapon: 'RUSTY_SWORD',
        armor: 'LEATHER_ARMOR'
    },
    RANGER: {
        weapon: 'SHORTBOW',
        armor: 'CLOTH_RAGS'
    }
};
