import { CLASS_CONFIG } from '../config/ClassConfig.js';

export class Stats {
    constructor(baseStats, level = 1, classType) {
        this.base = baseStats; // { STR, AGI, VIT, INT, WIL, LUK }
        this.level = level;
        this.classType = classType;
        
        // This will hold the actual numbers (Base + Level Growth)
        this.current = {}; 
        
        // This will hold the Combat Stats (Damage, Speed, etc)
        this.derived = {};
        
        this.update();
    }
    
    update() {
        // 1. Calculate Current Attributes based on Level
        const growth = CLASS_CONFIG[this.classType].growthRates;
        
        for (let stat in this.base) {
            // Formula: Base + (Growth * (Level - 1))
            this.current[stat] = this.base[stat] + (growth[stat] * (this.level - 1));
        }
        
        // 2. Calculate Derived Combat Stats (The "Big 6" Logic)
        
        // STR: Damage & Parry
        this.derived.meleeDamage = this.calculateMeleeDamage();
        this.derived.parryChance = Math.min(this.current.STR * 0.005, 0.30); // Cap 30%
        
        // AGI: Speed & Dodge
        this.derived.attackSpeed = this.calculateAttackSpeed();
        this.derived.dodgeChance = Math.min(this.current.AGI * 0.004, 0.25); // Cap 25%
        this.derived.moveSpeedMultiplier = 1 + (this.current.AGI * 0.01); // 1% speed per AGI
        
        // VIT: Health & Regen
        this.derived.maxHP = 100 + (this.current.VIT * 10);
        this.derived.hpRegen = this.current.VIT * 0.5; // HP per second
        this.derived.statusResist = this.current.VIT * 0.003;
        
        // INT: XP & Perception
        this.derived.xpMultiplier = 1 + (this.current.INT * 0.02);
        this.derived.perceptionRange = 200 + (this.current.INT * 2); // Base 200 + 2 per INT
        
        // WIL: Magic Resist & Bravery
        this.derived.magicResist = this.current.WIL * 0.008;
        // Retreat at 15% HP + 0.5% per WIL point
        this.derived.retreatThreshold = 0.15 + (this.current.WIL * 0.005);
        
        // LUK: Crit & Fortune
        this.derived.critChance = this.current.LUK * 0.006;
        this.derived.goldBonus = this.current.LUK * 0.01;
        this.derived.fateChance = this.current.LUK * 0.002;
    }
    
    calculateMeleeDamage() {
        const base = CLASS_CONFIG[this.classType].baseDamage;
        // Warrior Damage Formula
        return base * (1 + (this.current.STR * 0.1));
    }
    
    calculateAttackSpeed() {
        const base = CLASS_CONFIG[this.classType].baseAttackSpeed;
        // Returns cooldown in seconds (Lower is faster)
        return base / (1 + (this.current.AGI * 0.03));
    }
}