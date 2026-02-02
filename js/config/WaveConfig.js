// Wave Configuration
// Each wave defines: enemies to spawn and delay before next wave

export const WAVES = [
    {
        wave: 1,
        enemies: [
            { type: 'SWARM', count: 5 }
        ],
        buildTime: 30, // Seconds before this wave starts
        bonus: 50      // Gold bonus for clearing
    },
    {
        wave: 2,
        enemies: [
            { type: 'SWARM', count: 4 },
            { type: 'RANGED', count: 2 }
        ],
        buildTime: 35,
        bonus: 75
    },
    {
        wave: 3,
        enemies: [
            { type: 'SWARM', count: 6 },
            { type: 'RANGED', count: 2 },
            { type: 'TANK', count: 1 }
        ],
        buildTime: 40,
        bonus: 100
    },
    {
        wave: 4,
        enemies: [
            { type: 'SWARM', count: 8 },
            { type: 'RANGED', count: 3 }
        ],
        buildTime: 40,
        bonus: 125
    },
    {
        wave: 5,
        enemies: [
            { type: 'TANK', count: 2 },
            { type: 'RANGED', count: 4 },
            { type: 'SIEGE', count: 1 }
        ],
        buildTime: 45,
        bonus: 150
    },
    {
        wave: 6,
        enemies: [
            { type: 'SWARM', count: 10 },
            { type: 'TANK', count: 2 }
        ],
        buildTime: 45,
        bonus: 175
    },
    {
        wave: 7,
        enemies: [
            { type: 'RANGED', count: 5 },
            { type: 'SIEGE', count: 2 }
        ],
        buildTime: 50,
        bonus: 200
    },
    {
        wave: 8,
        enemies: [
            { type: 'SWARM', count: 12 },
            { type: 'RANGED', count: 4 },
            { type: 'TANK', count: 2 }
        ],
        buildTime: 50,
        bonus: 250
    },
    {
        wave: 9,
        enemies: [
            { type: 'SIEGE', count: 3 },
            { type: 'TANK', count: 3 },
            { type: 'RANGED', count: 4 }
        ],
        buildTime: 55,
        bonus: 300
    },
    {
        wave: 10,
        enemies: [
            { type: 'SWARM', count: 15 },
            { type: 'RANGED', count: 6 },
            { type: 'TANK', count: 4 },
            { type: 'SIEGE', count: 2 }
        ],
        buildTime: 60,
        bonus: 500
    }
];

export const WAVE_CONFIG = {
    totalWaves: WAVES.length,
    spawnDelay: 0.5,        // Delay between spawning each enemy in wave
    initialBuildTime: 45    // Time before Wave 1 starts
};
