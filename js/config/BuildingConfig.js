export const BUILDING_CONFIG = {
    CASTLE: {
        name: "Royal Castle",
        type: "CASTLE",
        cost: 0,
        hp: 2000,
        width: 80,
        height: 80,
        color: "#95a5a6", // Grey
        description: "The heart of your kingdom. Defend it!"
    },
    GUILD: {
        name: "Warrior Guild",
        type: "GUILD",
        cost: 300,
        hp: 200,
        width: 60,
        height: 60,
        color: "#8d6e63", 
        description: "Trains heroes and unlocks new abilities."
    },
    MARKET: {
        name: "Marketplace",
        type: "MARKET",
        cost: 200,
        hp: 150,
        width: 50,
        height: 50,
        color: "#e67e22", 
        description: "Sells potions. Generates tax income."
    },
    TOWER: {
        name: "Guard Tower",
        type: "TOWER",
        cost: 150,
        hp: 200,
        width: 40,
        height: 80, 
        color: "#7f8c8d", 
        attackRange: 150,
        damage: 10,
        description: "Defensive structure. Shoots nearby monsters."
    }
};