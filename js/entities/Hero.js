import { Utils } from '../utils.js';
import { Stats } from '../components/Stats.js';
import { Inventory } from '../components/Inventory.js';
import { CLASS_CONFIG } from '../config/ClassConfig.js';
import { Projectile } from './Projectile.js';
import { Particle } from './Particle.js';
import { ItemDrop } from './ItemDrop.js';
import { ITEM_CONFIG } from '../config/ItemConfig.js';

export class Hero {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.color = type === 'WARRIOR' ? '#3498db' : '#27ae60';
        this.radius = 15;
        this.visible = true;
        this.vel = { x: 0, y: 0 };
        this.acc = { x: 0, y: 0 };

        this.name = Utils.generateFantasyName(type);
        this.personality = {
            brave: Utils.rand(0.3, 1.0),
            greedy: Utils.rand(0.3, 1.0),
            smart: Utils.rand(0.3, 1.0),
            social: Utils.rand(0.3, 1.0) // NEW: Social trait
        };
        this.history = { kills: 0, goldEarned: 0, nearDeath: 0, timesWounded: 0 };

        this.level = 1;
        const config = CLASS_CONFIG[type];
        this.stats = new Stats(config.baseStats, this.level, type);

        this.inventory = new Inventory(); // Belt-based system (no capacity parameter)
        this.gold = 0;

        this.hp = this.stats.derived.maxHP;
        this.maxHp = this.stats.derived.maxHP;
        this.xp = 0;
        this.xpToNextLevel = 100;

        this.attackCooldown = 0;
        this.lastDamageTime = 0;

        this.state = 'IDLE';
        this.target = null;
        this.wanderTarget = { x: x, y: y };
        this.wanderTimer = 0;

        // BALANCING
        this.decisionTimer = 0; // Delay between major decisions
        this.maxStamina = Math.floor(this.stats.derived.staminaMax);
        this.stamina = this.maxStamina;
        this.staminaRegen = this.stats.derived.staminaRegen; // Per second
        this.tiredCooldown = 0; // Cooldown for "TIRED" particle spam
        this.shopTimer = 0;     // Time to spend shopping
        this.lastShopTime = -100; // Allow immediate shopping at start
        this.fateUsed = false;

        this.skills = [];
        this.skillActive = null;
        this.actionLockTimer = 0;
        this.isAiming = false;
        this.aimingTimer = 0;
        this.reactionTimer = 0;
        this.nextState = null; this.nextTarget = null;
        this.isEngaged = false; this.engagedLockTimer = 0;
        this.moveBlocked = false;
        this.victoryTimer = 0;
        this.attackWindup = 0;
        this.lungeTimer = 0;
        this.lungeVec = { x: 0, y: 0 };
        this.flashTimer = 0;
        // Ranger skill disabled per Operation Combat Polish
    }

    update(dt, game) {
        if (this.hp <= 0) { this.remove = true; return; }

        if (!this.visible) {
            if (this.state === 'SHOP') {
                this.behaviorShop(dt, game);
            } else {
                this.behaviorResting(dt, game);
            }
            return;
        }

        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        if (this.actionLockTimer > 0) this.actionLockTimer -= dt;
        if (this.aimingTimer > 0) { this.aimingTimer -= dt; if (this.aimingTimer <= 0) this.isAiming = false; }
        if (this.tiredCooldown > 0) this.tiredCooldown -= dt;
        // STAMINA REGEN
        if (this.stamina < this.maxStamina) {
            this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * dt);
        }

        if (this.skillActive && game.gameTime >= this.skillActive.activeUntil) {
            this.skillActive = null;
        }
        if (this.attackWindup > 0) this.attackWindup -= dt;
        if (this.lungeTimer > 0) this.lungeTimer -= dt;
        if (this.flashTimer > 0) this.flashTimer -= dt;
        if (this.reactionTimer > 0) {
            this.reactionTimer -= dt;
            if (this.reactionTimer > 0) return;
            if (this.nextState) { this.state = this.nextState; this.target = this.nextTarget; this.nextState = null; this.nextTarget = null; }
        }

        const retreatPercent = this.stats.derived.retreatThreshold / this.personality.brave;
        const retreatHP = this.maxHp * Utils.clamp(retreatPercent, 0.1, 0.8);

        if (this.hp < retreatHP && this.state !== 'RETREAT') {
            this.state = 'RETREAT';
            this.target = this.findHome(game);
            this.history.nearDeath++;
            game.entities.push(new Particle(this.x, this.y - 40, "FLEE!", "white"));
        }

        this.maintainSpace(game.entities, dt);

        // NEW: Auto-use potions when HP is low
        this.checkPotionUsage(game);

        // State Machine
        switch (this.state) {
            case 'RETREAT':
                this.behaviorRetreat(dt, game);
                break;
            case 'IDLE':
                this.behaviorIdle(dt, game);
                break;
            case 'FIGHT':
                this.behaviorFight(dt, game);
                break;
            case 'QUEST':
                this.behaviorQuest(dt, game);
                break;
            case 'SHOP':
                this.behaviorShop(dt, game);
                break;
            case 'VICTORY':
                this.behaviorVictory(dt, game);
                break;
        }
    }

    findHome(game) {
        let best = game.castle;
        let minDist = Utils.dist(this.x, this.y, best.x, best.y);
        game.entities.forEach(e => {
            if (e.constructor.name === 'EconomicBuilding' && (e.type === 'GUILD' || e.type === 'CASTLE')) {
                const d = Utils.dist(this.x, this.y, e.x, e.y);
                if (d < minDist) { minDist = d; best = e; }
            }
        });
        return best;
    }

    behaviorResting(dt, game) {
        if (this.hp >= this.maxHp) {
            if (this.target && this.target.exit) {
                this.target.exit(this);
            } else {
                this.visible = true;
            }
            this.state = 'IDLE';
            this.target = null;
            game.entities.push(new Particle(this.x, this.y - 30, "Ready!", "lime"));
        }
    }

    behaviorRetreat(dt, game) {
        if (!this.target || this.target.remove) {
            this.target = this.findHome(game);
        }

        if (Utils.dist(this.x, this.y, this.target.x, this.target.y) < 20) {
            if (this.target.enter) {
                this.target.enter(this);
            } else {
                this.hp += 50 * dt;
                if (this.hp >= this.maxHp) {
                    this.hp = this.maxHp;
                    this.state = 'IDLE';
                }
            }
        } else {
            this.moveTowards(this.target.x, this.target.y, dt, game);
        }
    }

    behaviorIdle(dt, game) {
        // SHOPPING CHECK
        // If we have gold and need potions (belt not full), go shop!
        // FIX: Add cooldown check to prevent loop
        if (this.gold >= 50 && !this.inventory.isBeltFull()) {
            if (game.gameTime - this.lastShopTime > 10) { // 10s cooldown
                // Check if market exists
                const hasMarket = game.entities.some(e => e.constructor.name === 'EconomicBuilding' && e.type === 'MARKET' && !e.remove);
                if (hasMarket) {
                    this.nextState = 'SHOP';
                    this.nextTarget = null; // Will find target in behaviorShop
                    this.reactionTimer = Utils.rand(0.2, 0.7);
                    game.entities.push(new Particle(this.x, this.y - 30, "!", "white"));
                    return;
                }
            }
        }

        const range = this.stats.derived.perceptionRange;
        const nearbyMonsters = game.entities.filter(e => e.constructor.name === 'Monster' && Utils.dist(this.x, this.y, e.x, e.y) < range);

        // PERSONALITY: Find preferred target based on traits
        const target = this.findPreferredTarget(nearbyMonsters);

        if (target) {
            this.nextState = 'FIGHT';
            this.nextTarget = target;
            game.entities.push(new Particle(this.x, this.y - 30, "!", "white"));
            this.reactionTimer = Utils.rand(0.2, 0.7);
            return;
        }

        // PERSONALITY: Cowardly avoidance
        // If there are monsters nearby but we didn't pick one (too dangerous), run away!
        if (nearbyMonsters.length > 0 && this.personality.brave < 0.4) {
            // Check morale before fleeing!
            const morale = this.calculateMorale(game);
            // If morale is high enough (lots of friends), maybe don't flee?
            // Coward (0.3) * Morale (e.g. 1.5) = 0.45 -> Still low, but maybe enough to stay?
            // Let's say effective bravery = brave * morale.

            if (this.personality.brave * morale < 0.5) {
                const closest = nearbyMonsters.sort((a, b) => Utils.dist(this.x, this.y, a.x, a.y) - Utils.dist(this.x, this.y, b.x, b.y))[0];
                const dist = Utils.dist(this.x, this.y, closest.x, closest.y);
                if (dist < 100) {
                    // Run away from closest threat
                    const angle = Math.atan2(this.y - closest.y, this.x - closest.x); // Angle AWAY
                    this.x += Math.cos(angle) * this.stats.derived.moveSpeedMultiplier * 60 * dt;
                    this.y += Math.sin(angle) * this.stats.derived.moveSpeedMultiplier * 60 * dt;
                    return; // Don't wander if fleeing
                }
            }
        }

        // SOCIAL: Party Formation / Following
        // DISABLED: Per user request to remove early party behavior for now.
        /*
        if (this.personality.social > 0.75) {
            const allies = this.findNearbyAllies(game, 150); // Reduced range (200 -> 150)
            if (allies.length > 0) {
                // Follow the "leader" (highest level or bravest)
                const leader = allies.sort((a, b) => b.level - a.level || b.personality.brave - a.personality.brave)[0];

                // Only follow if they are moving somewhere (have a target or wandering)
                // and I'm not too close already
                const distToLeader = Utils.dist(this.x, this.y, leader.x, leader.y);
                if (distToLeader > 40) {
                        this.moveTowards(leader.x, leader.y, dt, game);
                    return; // Follow leader instead of wandering randomly
                }
            }
        }
        */

        const flags = game.entities.filter(e => e.constructor.name === 'Flag');
        if (flags.length > 0) {
            const flag = flags[0];
            if (flag.reward * this.personality.greedy > 50) { this.state = 'QUEST'; this.target = flag; return; }
        }

        // BEHAVIOR: Warrior Defense / Patrol
        // Warriors with high bravery/social (duty) prefer to stay near the Castle
        if (this.type === 'WARRIOR') {
            const defendDesire = (this.personality.brave + this.personality.social) / 2;
            if (defendDesire > 0.6) {
                // Check distance to Castle
                const castle = game.castle; // Assuming game.castle exists
                if (castle) {
                    const distToCastle = Utils.dist(this.x, this.y, castle.x, castle.y);
                    if (distToCastle > 200) {
                        // Too far, patrol back
                        this.moveTowards(castle.x, castle.y, dt, game);
                        return;
                    }
                }
            }
        }

        this.wander(dt, game);
    }

    findNearbyAllies(game, range) {
        return game.entities.filter(e =>
            e.constructor.name === 'Hero' &&
            e !== this &&
            !e.remove &&
            e.hp > 0 &&
            Utils.dist(this.x, this.y, e.x, e.y) < range
        );
    }

    calculateMorale(game) {
        const allies = this.findNearbyAllies(game, 150);
        // Base morale 1.0
        // +0.2 per ally
        return 1.0 + (allies.length * 0.2);
    }

    evaluateThreatLevel(target) {
        if (!target) return 0;

        // Base threat: How fast can they kill me?
        // (Monster Dmg / My HP)
        const damageThreat = (target.damage || 10) / (this.hp || 1);

        // Size threat: HP pool
        const sizeThreat = (target.maxHp || 50) / (this.maxHp || 100);

        let threatScore = (damageThreat * 50) + (sizeThreat * 10);

        // Personality Modifiers
        // Brave heroes underestimate threat
        if (this.personality.brave > 0.7) threatScore *= 0.6;
        // Cowardly heroes overestimate threat
        if (this.personality.brave < 0.4) threatScore *= 1.5;
        // Smart heroes assess more accurately (closer to base) but penalty for unknowns? 
        // (For now, smart just doesn't have a skew, or maybe slight reduction for confidence)

        return threatScore;
    }

    findPreferredTarget(monsters) {
        if (!monsters || monsters.length === 0) return null;

        // 1. Filter out "Too Dangerous" targets
        // Threshold depends on bravery. 
        // Brave (1.0) tolerates score 100. Coward (0.0) tolerates score 20.
        const dangerTolerance = 20 + (this.personality.brave * 80);

        const validTargets = monsters.filter(m => {
            const threat = this.evaluateThreatLevel(m);
            return threat < dangerTolerance;
        });

        if (validTargets.length === 0) return null;

        // 2. Sort by Preference
        return validTargets.sort((a, b) => {
            // GREEDY: Prioritize Gold/Loot
            if (this.personality.greedy > 0.7) {
                return (b.goldValue || 0) - (a.goldValue || 0);
            }

            // BRAVE: Prioritize Strongest (Max HP)
            if (this.personality.brave > 0.7) {
                return b.maxHp - a.maxHp;
            }

            // SMART: Prioritize Weakest (Kill fast)
            if (this.personality.smart > 0.7) {
                return a.hp - b.hp;
            }

            // DEFAULT: Closest
            const distA = Utils.dist(this.x, this.y, a.x, a.y);
            const distB = Utils.dist(this.x, this.y, b.x, b.y);
            return distA - distB;
        })[0];
    }

    behaviorFight(dt, game) {
        if (!this.target || this.target.remove || this.target.hp <= 0) {
            if (this.target && this.target.hp <= 0) {
                this.history.kills++;
                this.gainXp(this.target.xpValue * this.stats.derived.xpMultiplier, game);
                if (!CLASS_CONFIG[this.type].isRanged && this.target && this.target.unregisterEngagement) this.target.unregisterEngagement(this);
                this.victoryTimer = Utils.rand(1.0, 2.0);
                game.entities.push(new Particle(this.x, this.y - 30, "Victory!", "gold"));
                const bounds = { width: game.canvas.width, height: game.canvas.height };
                this.wanderTarget = { x: Math.max(0, Math.min(bounds.width, this.x + Utils.rand(-80, 80))), y: Math.max(0, Math.min(bounds.height, this.y + Utils.rand(-80, 80))) };
                this.attackCooldown = 0;
                this.state = 'VICTORY'; this.target = null; return;
            }
            this.state = 'IDLE'; this.target = null; return;
        }

        const config = CLASS_CONFIG[this.type];
        const dist = Utils.dist(this.x, this.y, this.target.x, this.target.y);

        // CLASS BEHAVIOR: Optimal Range Maintenance
        const minRange = config.optimalRange ? config.optimalRange[0] : 0;
        const maxRange = config.optimalRange ? config.optimalRange[1] : 40;

        if (dist > maxRange) {
            // Too far: Chase
            this.isEngaged = false; this.engagedLockTimer = 0;
            this.moveTowards(this.target.x, this.target.y, dt);
        } else if (dist < minRange) {
            // Too close: Kite / Reposition (Ranger behavior)
            const kiting = this.behaviorKite(this.target, dt, game);
            if (!kiting) {
                // If too tired to kite, fight back!
                if (this.attackCooldown <= 0) {
                    this.attack(game);
                    this.attackCooldown = this.stats.derived.attackSpeed;
                }
            }
            this.isEngaged = false; this.engagedLockTimer = 0;
        } else {
            // In optimal range: Attack!
            if (this.attackWindup > 0) {
                // waiting to strike
            } else if (this.attackCooldown <= 0) {
                // first frame in range: windup before striking
                this.attackWindup = 0.5;
            }
            if (this.attackCooldown <= 0 && this.attackWindup <= 0) {
                this.attack(game);
                this.attackCooldown = this.stats.derived.attackSpeed;
            }
            if (!CLASS_CONFIG[this.type].isRanged && this.target.registerEngagement) this.target.registerEngagement(this);
            this.isEngaged = true;
            if (this.engagedLockTimer <= 0) this.engagedLockTimer = 1.2;
            this.vel.x = 0; this.vel.y = 0;
            this.acc.x = 0; this.acc.y = 0;
        }
    }

    behaviorKite(target, dt, game) {
        // STAMINA CHECK
            // Cost decreases with AGI; minimum 10 per second
            const kiteCostPerSec = Math.max(10, 25 - (this.stats.current.AGI * 0.5));
            const kiteCost = kiteCostPerSec * dt;
        if (this.stamina >= kiteCost) {

            // Move AWAY from target
            const angle = Math.atan2(this.y - target.y, this.x - target.x);
            const speed = CLASS_CONFIG[this.type].baseSpeed * this.stats.derived.moveSpeedMultiplier;

            // Only consume stamina if we actually move (speed > 0)
            if (speed > 0) {
                this.stamina -= kiteCost;
                this.x += Math.cos(angle) * speed * dt;
                this.y += Math.sin(angle) * speed * dt;
                return true; // Successfully kiting
            }
            return false; // Stuck/Rooted
        } else {
            // Out of stamina! Can't kite.
            if (game && this.tiredCooldown <= 0) {
                game.entities.push(new Particle(this.x, this.y - 40, "TIRED", "gray"));
                this.tiredCooldown = 2.0; // 2 seconds cooldown
            }
            return false; // Failed to kite
        }
    }

    behaviorShop(dt, game) {
        if (!this.target || this.target.remove) {
            const markets = game.entities.filter(e => e.constructor.name === 'EconomicBuilding' && e.type === 'MARKET' && !e.remove);
            if (markets.length === 0) { this.state = 'IDLE'; return; }
            this.target = markets.sort((a, b) => Utils.dist(this.x, this.y, a.x, a.y) - Utils.dist(this.x, this.y, b.x, b.y))[0];
        }

        const door = { x: this.target.x, y: this.target.y + (this.target.height/2) - 5 };
        const dist = Utils.dist(this.x, this.y, door.x, door.y);

        if (!this.target.constructed) { this.state = 'IDLE'; return; }
        if (this.visible && dist < 18) {
            if (this.target.enter) {
                this.target.enter(this);
                if (this.shopTimer <= 0) this.shopTimer = 3.0;
            }
        } else if (this.visible) {
            this.moveTowards(door.x, door.y, dt, game);
        }

        if (!this.visible && this.shopTimer > 0) {
            this.shopTimer -= dt;
            if (this.shopTimer <= 0) {
                this.lastShopTime = game.gameTime;
                if (this.target && this.target.exit) this.target.exit(this);
                this.state = 'IDLE';
                this.target = null;
            }
        }
    }

    checkPotionUsage(game) {
        // Only use potions when visible and not resting in a building
        if (!this.visible) return;

        // Don't use potions if we're already retreating to heal
        // (Let the building heal us for free instead)
        if (this.state === 'RETREAT') return;

        // Calculate drink threshold based on personality
        // Formula: Base 40% HP * personality modifier
        // - Brave heroes (1.0): Drink at 40% HP (efficient)
        // - Cowardly heroes (0.3): Drink at 68% HP (wasteful but safe)
        const baseDrinkPercent = 0.40;
        const personalityModifier = (2 - this.personality.brave);
        const drinkThreshold = this.maxHp * baseDrinkPercent * personalityModifier;

        // Check: HP low enough AND we have a potion
        if (this.hp < drinkThreshold && this.inventory.hasPotion()) {
            const potion = this.inventory.usePotion();

            if (potion) {
                // Heal the hero
                const healAmount = potion.healAmount || 50;
                const oldHp = this.hp;
                this.hp = Math.min(this.hp + healAmount, this.maxHp);
                const actualHeal = this.hp - oldHp;

                // Visual feedback
                game.entities.push(new Particle(
                    this.x,
                    this.y - 40,
                    `+ ${Math.floor(actualHeal)} HP`,
                    "#2ecc71"
                ));

                // Optional: Add a "gulp" sound effect trigger here
                // game.playSound('potion_drink');
            }
        }
    }

    dropPotions(game) {
        const potions = this.inventory.getAllPotions();

        // Drop each potion as a lootable ItemDrop entity
        potions.forEach((potion, index) => {
            // Scatter drops in a small circle around the hero
            const angle = (Math.PI * 2 / potions.length) * index;
            const dropX = this.x + Math.cos(angle) * 20;
            const dropY = this.y + Math.sin(angle) * 20;

            game.entities.push(new ItemDrop(dropX, dropY, potion.type));
        });

        // Clear the hero's inventory
        this.inventory.clearPotions();
    }

    attack(game) {
        let damage = this.stats.derived.meleeDamage;
        if (Math.random() < this.stats.derived.critChance) { damage *= 2; game.entities.push(new Particle(this.x, this.y - 30, "CRIT!", "#ff00ff")); }
        // Pass 'this' as source so monsters know who attacked them
        if (CLASS_CONFIG[this.type].isRanged) {
            game.entities.push(new Projectile(this.x, this.y, this.target, damage, this));
        }
        else {
            this.target.takeDamage(damage, game, this);
        }
        this.actionLockTimer = 0.5;
        if (CLASS_CONFIG[this.type].isRanged) { this.isAiming = true; this.aimingTimer = 0.5; }
        // Lunge forward a bit
        if (this.target) {
            const ang = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            this.lungeVec = { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 };
            this.lungeTimer = 0.12;
        }
    }

    takeDamage(amount, game, source = null) {
        this.lastDamageTime = game.gameTime;
        let dodge = this.stats.derived.dodgeChance;
        if (this.skillActive && this.skillActive.dodgeBonus) dodge += this.skillActive.dodgeBonus;
        if (Math.random() < dodge) { if (game) game.entities.push(new Particle(this.x, this.y - 20, "DODGE", "cyan")); return; }
        if (Math.random() < this.stats.derived.parryChance) { amount *= 0.5; if (game) game.entities.push(new Particle(this.x, this.y - 20, "PARRY", "white")); }
        if (this.stats.derived.physicalResist) { amount -= amount * this.stats.derived.physicalResist; }
        this.hp -= amount; this.history.timesWounded++;
        if (game) game.entities.push(new Particle(this.x, this.y - 20, "-" + Math.floor(amount), "red"));
        this.flashTimer = 0.06;

        // NEW: Drop potions on death
        if (this.hp <= 0) {
            this.dropPotions(game);
        }
    }

    gainXp(amount, game) {
        this.xp += amount;
        if (this.xp >= this.xpToNextLevel) this.levelUp(game);
    }

    levelUp(game) {
        this.level++; this.xp = 0; this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5);
        this.stats.level = this.level; this.stats.update();
        this.maxHp = this.stats.derived.maxHP; this.hp = this.maxHp;
        this.maxStamina = Math.floor(this.stats.derived.staminaMax);
        this.staminaRegen = this.stats.derived.staminaRegen;
        this.stamina = this.maxStamina;
        // Ranger skill disabled per Operation Combat Polish
        game.entities.push(new Particle(this.x, this.y - 40, "LEVEL UP!", "#00ffff"));
    }

    moveTowards(tx, ty, dt, game) {
        if (this.actionLockTimer > 0 || this.isAiming || this.moveBlocked) return;
        let maxSpeed = CLASS_CONFIG[this.type].baseSpeed * this.stats.derived.moveSpeedMultiplier * (this.skillActive?.speedMult || 1);
        const staminaPct = this.stamina / this.maxStamina; if (staminaPct < 0.2) maxSpeed *= 0.5;
        const dx = tx - this.x, dy = ty - this.y;
        const dist = Math.hypot(dx, dy);
        const dir = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 0, y: 0 };
        const arriveRadius = 50;
        const desiredSpeed = dist < arriveRadius ? maxSpeed * (dist / arriveRadius) : maxSpeed;
        // Flow field blending (untuk target bangunan/retreat)
        let flow = { x: 0, y: 0 };
        if (game && this.target && this.target.constructor.name === 'EconomicBuilding' && this.target.id) {
            const door = game.getDoorPoint(this.target);
            flow = game.getFlowVector(this.target.id + ':door', door.x, door.y, this.x, this.y);
        } else if (game && tx === game.castle.x && ty === game.castle.y) {
            const door = game.getDoorPoint(game.castle);
            flow = game.getFlowVector('castle:door', door.x, door.y, this.x, this.y);
        }
        const flowWeight = 0.6;
        const blendDir = Utils.normalize(dir.x + flow.x * flowWeight, dir.y + flow.y * flowWeight);
        const desired = { x: blendDir.x * desiredSpeed, y: blendDir.y * desiredSpeed };
        const steer = { x: desired.x - this.vel.x, y: desired.y - this.vel.y };
        const limited = Utils.limitVec(steer.x, steer.y, maxSpeed);
        this.acc.x += limited.x; this.acc.y += limited.y;
    }

    cooldownRemaining(skill, game) {
        return Math.max(0, (skill.lastUsed || -100) + skill.cooldown - game.gameTime);
    }

    canUseSkill(skill, game) {
        return this.stamina >= skill.staminaCost && this.cooldownRemaining(skill, game) <= 0;
    }

    useSkill(skill, game) {
        this.stamina -= skill.staminaCost;
        skill.lastUsed = game.gameTime;
        const dur = Math.min(skill.durationMax, skill.durationBase + skill.durationPerLevel * this.level);
        this.skillActive = { speedMult: skill.speedMult, dodgeBonus: skill.dodgeBonus, activeUntil: game.gameTime + dur };
        game.entities.push(new Particle(this.x, this.y - 40, skill.name, "cyan"));
    }

    wander(dt, game) {
        // Fix: Initialize wanderTimer if undefined or invalid
        if (typeof this.wanderTimer !== 'number' || isNaN(this.wanderTimer)) {
            this.wanderTimer = 0;
        }

        // Fix: Initialize wanderTarget if undefined
        if (!this.wanderTarget) {
            this.wanderTarget = { x: this.x, y: this.y };
        }

        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            // Fix: Safety check for canvas dimensions
            const bounds = {
                width: (game.canvas && game.canvas.width) || 800,
                height: (game.canvas && game.canvas.height) || 600
            };

            this.wanderTarget.x = Math.max(0, Math.min(bounds.width, this.x + Utils.rand(-100, 100)));
            this.wanderTarget.y = Math.max(0, Math.min(bounds.height, this.y + Utils.rand(-100, 100)));
            this.wanderTimer = 3;
        }

        const dist = Utils.dist(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y);
        if (!isNaN(dist) && dist > 10) {
            this.moveTowards(this.wanderTarget.x, this.wanderTarget.y, dt, game);
        }
    }

    maintainSpace(entities, dt) {
        this.moveBlocked = false;
        let sepX = 0, sepY = 0;
        entities.forEach(e => {
            if (e === this || e.remove) return;
            const isUnit = e.constructor.name === 'Hero' || e.constructor.name === 'Monster' || e.constructor.name === 'Worker' || e.constructor.name === 'CastleGuard';
            if (isUnit) {
                const dist = Utils.dist(this.x, this.y, e.x, e.y);
                const minGap = this.radius + e.radius;
                if (dist < minGap && dist > 0) {
                    const nx = (this.x - e.x) / dist;
                    const ny = (this.y - e.y) / dist;
                    const overlap = (minGap - dist);
                    const scale = this.isEngaged ? 0.0 : 0.5;
                    sepX += nx * overlap * scale;
                    sepY += ny * overlap * scale;
                }
                // Hard-stop if ally directly ahead and too close
                const fx = (this.target ? this.target.x : (this.wanderTarget ? this.wanderTarget.x : this.x));
                const fy = (this.target ? this.target.y : (this.wanderTarget ? this.wanderTarget.y : this.y));
                const dir = Utils.normalize(fx - this.x, fy - this.y);
                const ax = e.x - this.x, ay = e.y - this.y;
                const aheadDot = Utils.dot(dir.x, dir.y, (ax / ((dist||1))), (ay / ((dist||1))));
                if (aheadDot > 0.6 && dist < minGap * 0.8) this.moveBlocked = true;
            }

            if (e.constructor.name === 'EconomicBuilding') {
                const fx = (this.target ? this.target.x : (this.wanderTarget ? this.wanderTarget.x : this.x));
                const fy = (this.target ? this.target.y : (this.wanderTarget ? this.wanderTarget.y : this.y));
                const dir = Utils.normalize(fx - this.x, fy - this.y);
                const bx = e.x - this.x;
                const by = e.y - this.y;
                const bd = Math.hypot(bx, by);
                if (bd < Math.max(e.width, e.height)) {
                    const bdir = Utils.normalize(bx, by);
                    const facing = Utils.dot(dir.x, dir.y, bdir.x, bdir.y);
                    if (facing > 0.8) {
                        const perp = Utils.perp(dir.x, dir.y);
                        this.x += perp.x * 15 * dt;
                        this.y += perp.y * 15 * dt;
                    }
                }
            }
        });
        const isRanged = CLASS_CONFIG[this.type]?.isRanged;
        if (isRanged && this.state === 'FIGHT' && !this.skillActive && this.target) {
            const minRange = CLASS_CONFIG[this.type].optimalRange ? CLASS_CONFIG[this.type].optimalRange[0] : 0;
            const maxRange = CLASS_CONFIG[this.type].optimalRange ? CLASS_CONFIG[this.type].optimalRange[1] : 40;
            const d = Utils.dist(this.x, this.y, this.target.x, this.target.y);
            const scale = d >= minRange && d <= maxRange ? 0.1 : 1.0;
            this.acc.x += sepX * scale;
            this.acc.y += sepY * scale;
        } else {
            this.acc.x += sepX;
            this.acc.y += sepY;
        }
    }

    integrate(dt, game) {
        const maxSpeed = CLASS_CONFIG[this.type].baseSpeed * this.stats.derived.moveSpeedMultiplier * (this.skillActive?.speedMult || 1);
        if (this.isEngaged) { this.vel.x = 0; this.vel.y = 0; this.acc.x = 0; this.acc.y = 0; return; }
        this.vel.x += this.acc.x * dt;
        this.vel.y += this.acc.y * dt;
        const limited = Utils.limitVec(this.vel.x, this.vel.y, maxSpeed);
        this.vel.x = limited.x; this.vel.y = limited.y;
        this.x += this.vel.x * dt;
        this.y += this.vel.y * dt;
        this.acc.x = 0; this.acc.y = 0;
    }

    behaviorVictory(dt, game) {
        if (this.victoryTimer > 0) {
            this.victoryTimer -= dt;
            if (this.victoryTimer <= 0) this.state = 'IDLE';
        } else {
            this.state = 'IDLE';
        }
    }

    draw(ctx) {
        if (!this.visible) return;

        let ox = 0, oy = 0;
        if (this.lungeTimer > 0) { const t = this.lungeTimer / 0.12; ox = this.lungeVec.x * t; oy = this.lungeVec.y * t; }
        Utils.drawSprite(ctx, 'hero', this.x + ox, this.y + oy, 20 + (this.level), this.color);
        // HP bar
        ctx.fillStyle = 'red'; ctx.fillRect(this.x - 10, this.y - 25, 20, 4);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(this.x - 10, this.y - 25, 20 * (this.hp / this.maxHp), 4);
        // STAMINA bar (physical classes emphasized)
        ctx.fillStyle = '#444'; ctx.fillRect(this.x - 10, this.y - 20, 20, 3);
        ctx.fillStyle = '#00bfff'; ctx.fillRect(this.x - 10, this.y - 20, 20 * (this.stamina / this.maxStamina), 3);
        if (this.flashTimer > 0) { ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2); ctx.stroke(); }
        ctx.save(); ctx.fillStyle = 'white'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
        const text = `${this.name} (Lv.${this.level})`;
        ctx.strokeText(text, this.x, this.y - 32); ctx.fillText(text, this.x, this.y - 32);
        if (this.personality.brave < 0.4) { ctx.fillStyle = 'red'; ctx.fillRect(this.x - 12, this.y - 42, 4, 4); }
        if (this.personality.greedy > 0.7) { ctx.fillStyle = 'gold'; ctx.fillRect(this.x - 2, this.y - 42, 4, 4); }
        if (this.personality.smart > 0.7) { ctx.fillStyle = 'cyan'; ctx.fillRect(this.x + 8, this.y - 42, 4, 4); }
        ctx.restore();
    }
}
