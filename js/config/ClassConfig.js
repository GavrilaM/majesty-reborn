export const CLASS_CONFIG = {
    WARRIOR: {
        baseStats: { STR: 10, AGI: 5, VIT: 12, INT: 3, WIL: 8, LUK: 5 },
        growthRates: { STR: 3, AGI: 1, VIT: 2, INT: 0.5, WIL: 1.5, LUK: 1 },
        baseDamage: 15,
        baseAttackSpeed: 2.0, // Seconds per attack
        baseSpeed: 50,        // Pixels per second
        optimalRange: [0, 40], // Melee
        description: "Tough melee fighter with high survivability"
    },
    RANGER: {
        baseStats: { STR: 4, AGI: 12, VIT: 6, INT: 10, WIL: 5, LUK: 8 },
        growthRates: { STR: 1, AGI: 3, VIT: 1, INT: 2, WIL: 1, LUK: 1.5 },
        baseDamage: 8,
        baseAttackSpeed: 1.5,
        baseSpeed: 70,
        isRanged: true,
        optimalRange: [100, 150], // Kiting range
        description: "Fast ranged attacker with high evasion"
    }
};

export const MONSTER_ARCHETYPES = {
    SWARM: {
        name: "Goblin",
        hp: 50,
        damage: 8,
        speed: 65, // Faster than warriors (50)
        xpReward: 10,
        goldDrop: 15,
        description: "Quick scavenger that harasses and retreats.",
        dodgeChance: 0.1,
        parryChance: 0.0,
        resistPct: 0.05,
        targetPriority: 'HERO',
        spawnCount: [5, 8],
        color: "#4a7c34"
    },
    TANK: {
        name: "Ogre",
        hp: 250,
        damage: 25,
        speed: 25,
        xpReward: 50,
        goldDrop: 50,
        description: "Brutish enforcer with thick hide and slow swings.",
        dodgeChance: 0.02,
        parryChance: 0.08,
        resistPct: 0.2,
        targetPriority: 'HERO',
        spawnCount: [1, 2],
        color: "#8b4513"
    }
    // We will add Ranged/Siege in Week 4 as per roadmap
};
