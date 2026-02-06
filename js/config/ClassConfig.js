export const CLASS_CONFIG = {
    MERCENARY: {
        baseStats: { STR: 9, AGI: 6, VIT: 10, INT: 3, WIL: 6, LUK: 6 },
        growthRates: { STR: 2.5, AGI: 1.5, VIT: 2, INT: 0.5, WIL: 1, LUK: 1.5 },
        baseDamage: 14,
        baseAttackSpeed: 1.8, // Seconds per attack
        baseSpeed: 65,        // Pixels per second
        optimalRange: [0, 35], // Melee
        displayName: "Mercenary",
        description: "A hired thug. Cheap, greedy, and fights dirty.",
        recruitCost: 100,
        color: '#3498db',
        // Behavior affinities (0.0-1.0) - affects DECISION state weighting
        patrolAffinity: 0.8,   // Loves patrolling, protecting buildings
        exploreAffinity: 0.3   // Less interested in exploring far from city
    },
    WAYFARER: {
        baseStats: { STR: 4, AGI: 14, VIT: 5, INT: 8, WIL: 5, LUK: 10 },
        growthRates: { STR: 1, AGI: 3.5, VIT: 1, INT: 1.5, WIL: 1, LUK: 2 },
        baseDamage: 7,
        baseAttackSpeed: 1.3,
        baseSpeed: 90,
        isRanged: true,
        optimalRange: [80, 140], // Kiting range
        displayName: "Wayfarer",
        description: "A wandering scout. Fast, evasive, and hard to pin down.",
        recruitCost: 120,
        color: '#27ae60',
        // Behavior affinities (0.0-1.0) - affects DECISION state weighting
        patrolAffinity: 0.3,   // Prefers freedom over patrol duty
        exploreAffinity: 0.9   // Loves exploring, finding treasure
    },
    // Legacy aliases for backward compatibility
    WARRIOR: null, // Will be set below
    RANGER: null   // Will be set below
};

// Backward compatibility aliases
CLASS_CONFIG.WARRIOR = CLASS_CONFIG.MERCENARY;
CLASS_CONFIG.RANGER = CLASS_CONFIG.WAYFARER;

/**
 * SKILL_CONFIG - Defines all hero skills, their costs, effects, and AI triggers.
 * Skills are organized by class and tier.
 */
export const SKILL_CONFIG = {
    // ============================================
    // MERCENARY SKILLS (Dirty Fighter Theme)
    // ============================================
    MERCENARY: {
        // Tier 1: Available at Lv 1 (Bought at Guild)
        SAND_KICK: {
            id: 'SAND_KICK',
            name: 'Dirty Fighting',
            description: 'Kick sand in enemy eyes. Stuns and reduces accuracy.',
            tier: 1,
            learnCost: 150,        // Gold to learn at Guild
            reqLevel: 1,
            staminaCost: 35,
            cooldown: 8.0,         // Seconds
            // Effects
            stunDuration: 1.5,
            accuracyDebuff: 0.2,   // -20% accuracy for 3 seconds
            debuffDuration: 3.0,
            bonusDamage: 5,
            // AI Trigger Logic
            trigger: {
                type: 'ENEMY_CLOSE',      // When enemy is within melee range
                minDistance: 0,
                maxDistance: 45,
                hpThreshold: 1.0,         // Use anytime (HP doesn't matter)
                enemyAttacking: true      // Prefer when enemy is attacking
            },
            // Visual
            particleColor: '#c2b280',     // Sand color
            particleText: 'DIRTY!'
        },
        // Tier 2: Available at Lv 4
        SUCKER_PUNCH: {
            id: 'SUCKER_PUNCH',
            name: 'Sucker Punch',
            description: 'A devastating cheap shot. High damage with knockback.',
            tier: 2,
            learnCost: 500,
            reqLevel: 4,
            staminaCost: 50,
            cooldown: 12.0,
            // Effects
            damageMultiplier: 2.0,
            knockbackDistance: 30,
            trigger: {
                type: 'ENEMY_LOW_HP',
                hpThreshold: 0.4,         // Use when enemy < 40% HP
                maxDistance: 40
            },
            particleColor: '#ff6b6b',
            particleText: 'CHEAP SHOT!'
        },
        // Tier 3: Passive at Lv 7
        GANG_UP: {
            id: 'GANG_UP',
            name: 'Gang Up',
            description: 'Deal bonus damage when allies attack the same target.',
            tier: 3,
            learnCost: 1500,
            reqLevel: 7,
            isPassive: true,
            // Effects
            bonusDamagePerAlly: 0.15     // +15% damage per ally on same target
        }
    },

    // ============================================
    // WAYFARER SKILLS (Evasive Scout Theme)
    // ============================================
    WAYFARER: {
        // Tier 1: Available at Lv 1
        TUMBLE: {
            id: 'TUMBLE',
            name: 'Tumble',
            description: 'Dash backward to safety and fire a quick shot.',
            tier: 1,
            learnCost: 150,
            reqLevel: 1,
            staminaCost: 40,
            cooldown: 6.0,
            // Effects
            dashDistance: 80,
            instantShot: true,
            shotDamageMultiplier: 1.2,
            // AI Trigger Logic
            trigger: {
                type: 'ENEMY_CLOSE',
                minDistance: 0,
                maxDistance: 80,          // Danger zone (increased for better trigger)
                hpThreshold: 1.0,         // Always trigger when enemy close (was 0.9)
                useNavGrid: true          // Check NavGrid for safe landing
            },
            particleColor: '#00bfff',
            particleText: 'TUMBLE!'
        },
        // Tier 2: Available at Lv 4
        CALTROPS: {
            id: 'CALTROPS',
            name: 'Caltrops',
            description: 'Leave caltrops behind when evading. Slows enemies.',
            tier: 2,
            learnCost: 500,
            reqLevel: 4,
            staminaCost: 45,
            cooldown: 10.0,
            // Effects
            dashDistance: 70,
            slowEffect: 0.5,              // 50% slow
            slowDuration: 3.0,
            slowRadius: 40,
            trigger: {
                type: 'ENEMY_CLOSE',
                maxDistance: 50,
                useNavGrid: true
            },
            particleColor: '#888888',
            particleText: 'CALTROPS!'
        },
        // Tier 3: Available at Lv 7
        KILL_SHOT: {
            id: 'KILL_SHOT',
            name: 'Kill Shot',
            description: 'Execute low HP enemies with a devastating arrow.',
            tier: 3,
            learnCost: 1500,
            reqLevel: 7,
            staminaCost: 60,
            cooldown: 15.0,
            // Effects
            damageMultiplier: 3.0,
            executeThreshold: 0.2,        // Target must be < 20% HP
            trigger: {
                type: 'ENEMY_LOW_HP',
                hpThreshold: 0.2,
                maxDistance: 150
            },
            particleColor: '#ff0000',
            particleText: 'KILL SHOT!'
        }
    }
};


export const MONSTER_ARCHETYPES = {
    SWARM: {
        name: "Goblin",
        hp: 50,
        damage: 8,
        speed: 75,
        attackRange: 15,
        xpReward: 10,
        goldDrop: 15,
        description: "Quick scavenger that harasses and retreats.",
        dodgeChance: 0.1,
        parryChance: 0.0,
        resistPct: 0.05,
        targetPriority: 'HERO',
        spawnCount: [1, 2],
        color: "#4a7c34",
        behavior: 'SWARM',
        swarmThreshold: 3 // Group size to trigger attack
    },
    RANGED: {
        name: "Ratman",
        hp: 40,
        damage: 12,
        speed: 85, // Very fast
        attackRange: 180, // Ranged
        xpReward: 15,
        goldDrop: 20,
        description: "Vile archer that shoots from distance.",
        dodgeChance: 0.15,
        parryChance: 0.0,
        resistPct: 0.0,
        targetPriority: 'HERO',
        spawnCount: [1, 2],
        color: "#8e44ad", // Purple
        behavior: 'RANGED',
        projectileColor: '#8e44ad'
    },
    TANK: {
        name: "Ogre",
        hp: 250,
        damage: 25,
        speed: 35,
        attackRange: 20,
        xpReward: 50,
        goldDrop: 50,
        description: "Brutish enforcer with thick hide.",
        dodgeChance: 0.02,
        parryChance: 0.08,
        resistPct: 0.2,
        targetPriority: 'HERO',
        spawnCount: [0, 1],
        color: "#8b4513",
        behavior: 'TANK'
    },
    SIEGE: {
        name: "Minotaur",
        hp: 400,
        damage: 40,
        speed: 30, // Slow
        attackRange: 25,
        xpReward: 100,
        goldDrop: 80,
        description: "Siege beast that destroys buildings.",
        dodgeChance: 0.0,
        parryChance: 0.1,
        resistPct: 0.3, // Tanky
        targetPriority: 'BUILDING', // Ignores heroes usually
        spawnCount: [0, 1],
        color: "#c0392b", // Red
        behavior: 'SIEGE'
    }
};
