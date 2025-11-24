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
        
        this.name = Utils.generateFantasyName(type);
        this.personality = {
            brave: Utils.rand(0.3, 1.0),
            greedy: Utils.rand(0.3, 1.0),
            smart: Utils.rand(0.3, 1.0)
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
        this.wanderTimer = 0;
        this.wanderTarget = {x: x, y: y};
        this.fateUsed = false;
        this.decisionTimer = 0;
        this.nextState = null;
        this.nextTarget = null;
    }

    update(dt, game) {
        if (this.hp <= 0) { this.remove = true; return; }
        
        if (!this.visible) {
            this.behaviorResting(dt, game);
            return;
        }

        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        if (this.decisionTimer > 0) this.decisionTimer -= dt;

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

        const market = this.findMarket(game);
        const needsPotions = !this.inventory.isBeltFull() && this.gold >= (ITEM_CONFIG.POTION?.cost || 30);
        if (this.state !== 'RETREAT' && this.state !== 'FIGHT' && market && needsPotions && this.decisionTimer <= 0) {
            this.nextState = 'SHOPPING';
            this.nextTarget = market;
            this.decisionTimer = Utils.rand(0, 2);
        }

        if (this.decisionTimer <= 0 && this.nextState && this.state !== 'FIGHT' && this.state !== 'RETREAT') {
            this.state = this.nextState;
            this.target = this.nextTarget;
            this.nextState = null;
            this.nextTarget = null;
        }

        if (this.state === 'RETREAT') this.behaviorRetreat(dt, game);
        else if (this.state === 'IDLE') this.behaviorIdle(dt, game);
        else if (this.state === 'FIGHT') this.behaviorFight(dt, game);
        else if (this.state === 'QUEST') this.behaviorQuest(dt, game);
        else if (this.state === 'SHOPPING') this.behaviorShopping(dt, game);
        else if (this.state === 'EXPLORE') this.behaviorExplore(dt, game);
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
            this.moveTowards(this.target.x, this.target.y, dt);
        }
    }

    behaviorIdle(dt, game) {
        const range = this.stats.derived.perceptionRange;
        const nearbyMonsters = game.entities.filter(e => e.constructor.name === 'Monster' && Utils.dist(this.x, this.y, e.x, e.y) < range);
        if (nearbyMonsters.length > 0) { this.state = 'FIGHT'; this.target = nearbyMonsters[0]; return; } 
        const flags = game.entities.filter(e => e.constructor.name === 'Flag');
        if (flags.length > 0) {
            const flag = flags[0];
            if (flag.reward * this.personality.greedy > 50) { this.state = 'QUEST'; this.target = flag; return; }
        }
        if (this.decisionTimer <= 0) {
            const d = this.decideIdleAction(game);
            if (d) { this.state = d.state; this.target = d.target; this.decisionTimer = d.delay; }
        }
        if (this.state === 'PATROL') {
            this.behaviorPatrol(dt, game);
        } else if (this.state === 'SHOPPING') {
            this.behaviorShopping(dt, game);
        } else {
            this.state = 'EXPLORE';
            this.wander(dt, game);
        }
    }

    behaviorFight(dt, game) {
        if (!this.target || this.target.remove || this.target.hp <= 0) {
            if (this.target && this.target.hp <= 0) {
                this.history.kills++;
                this.gainXp(this.target.xpValue * this.stats.derived.xpMultiplier, game);
            }
            this.state = 'IDLE'; this.target = null; return;
        }
        const range = CLASS_CONFIG[this.type].isRanged ? 150 : 40;
        if (Utils.dist(this.x, this.y, this.target.x, this.target.y) > range) {
            this.moveTowards(this.target.x, this.target.y, dt);
        } else {
            if (this.attackCooldown <= 0) {
                this.attack(game);
                this.attackCooldown = this.stats.derived.attackSpeed;
            }
        }
    }

    behaviorShopping(dt, game) {
        if (!this.target || this.target.remove || this.target.type !== 'MARKET') { this.state = 'IDLE'; return; }
        if (Utils.dist(this.x, this.y, this.target.x, this.target.y) < 20) {
            if (this.target.enter) {
                this.target.enter(this);
            }
        } else {
            this.moveTowards(this.target.x, this.target.y, dt);
        }
    }

    behaviorExplore(dt, game) {
        const range = this.stats.derived.perceptionRange;
        const nearbyMonsters = game.entities.filter(e => e.constructor.name === 'Monster' && Utils.dist(this.x, this.y, e.x, e.y) < range);
        if (nearbyMonsters.length > 0) { this.state = 'FIGHT'; this.target = nearbyMonsters[0]; return; }
        const flags = game.entities.filter(e => e.constructor.name === 'Flag');
        if (flags.length > 0) {
            const flag = flags[0];
            if (flag.reward * this.personality.greedy > 50) { this.state = 'QUEST'; this.target = flag; return; }
        }
        if (this.decisionTimer <= 0) {
            const d = this.decideIdleAction(game);
            if (d) { this.state = d.state; this.target = d.target; this.decisionTimer = d.delay; }
        }
        if (this.state === 'PATROL') {
            this.behaviorPatrol(dt, game);
        } else if (this.state === 'SHOPPING') {
            this.behaviorShopping(dt, game);
        } else {
            this.wander(dt, game);
        }
    }

    behaviorQuest(dt, game) {
        if (!this.target || this.target.remove) { this.state = 'IDLE'; return; }
        this.moveTowards(this.target.x, this.target.y, dt);
        if (Utils.dist(this.x, this.y, this.target.x, this.target.y) < 20) {
            this.target.remove = true; this.state = 'IDLE';
            let reward = this.target.reward;
            if (Math.random() < this.stats.derived.goldBonus) { reward = Math.floor(reward * 1.5); game.entities.push(new Particle(this.x, this.y - 50, "LUCKY!", "gold")); }
            this.history.goldEarned += reward;
            this.gold += reward;
            game.entities.push(new Particle(this.x, this.y - 30, `+${reward}g`, "gold"));
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
                    `+${Math.floor(actualHeal)} HP`, 
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
    }

    takeDamage(amount, game, source = null) {
        this.lastDamageTime = game.gameTime;
        if (Math.random() < this.stats.derived.dodgeChance) { if(game) game.entities.push(new Particle(this.x, this.y - 20, "DODGE", "cyan")); return; }
        if (Math.random() < this.stats.derived.parryChance) { amount *= 0.5; if(game) game.entities.push(new Particle(this.x, this.y - 20, "PARRY", "white")); }
        this.hp -= amount; this.history.timesWounded++;
        if (game) game.entities.push(new Particle(this.x, this.y - 20, "-" + Math.floor(amount), "red"));
        if (amount > 0 && source && this.visible && this.state !== 'RETREAT' && this.hp > 0) {
            this.state = 'FIGHT';
            this.target = source;
            this.nextState = null;
            this.nextTarget = null;
            this.decisionTimer = 0;
        }
        
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
        game.entities.push(new Particle(this.x, this.y - 40, "LEVEL UP!", "#00ffff"));
    }

    moveTowards(tx, ty, dt) {
        const speed = CLASS_CONFIG[this.type].baseSpeed * this.stats.derived.moveSpeedMultiplier;
        const angle = Math.atan2(ty - this.y, tx - this.x);
        this.x += Math.cos(angle) * speed * dt;
        this.y += Math.sin(angle) * speed * dt;
    }
    
    behaviorPatrol(dt, game) {
        const home = this.findHome(game);
        const px = home ? home.x + Utils.rand(-80, 80) : this.x;
        const py = home ? home.y + Utils.rand(40, 120) : this.y;
        if (!this.wanderTarget) this.wanderTarget = { x: this.x, y: this.y };
        if (Utils.dist(this.wanderTarget.x, this.wanderTarget.y, this.x, this.y) < 10) {
            this.wanderTarget.x = px;
            this.wanderTarget.y = py;
        }
        this.moveTowards(this.wanderTarget.x, this.wanderTarget.y, dt);
    }

    decideIdleAction(game) {
        const hasMarket = !!this.findMarket(game);
        const canShop = hasMarket && !this.inventory.isBeltFull() && this.gold >= (ITEM_CONFIG.POTION?.cost || 30);
        let exploreW = this.type === 'RANGER' ? 0.6 : 0.3;
        let patrolW = this.type === 'RANGER' ? 0.3 : 0.6;
        let shopW = 0.1;
        exploreW += (this.personality.brave - 0.5) * 0.2;
        patrolW += (0.5 - this.personality.brave) * 0.2;
        shopW += (this.personality.smart - 0.5) * 0.4 + (this.personality.greedy - 0.5) * 0.2;
        shopW *= canShop ? 1 : 0.1;
        const sum = exploreW + patrolW + shopW;
        const r = Math.random() * sum;
        const delay = Utils.rand(0, 2);
        if (r < shopW) return { state: 'SHOPPING', target: this.findMarket(game), delay };
        else if (r < shopW + patrolW) return { state: 'PATROL', target: this.findHome(game), delay };
        return { state: 'EXPLORE', target: null, delay };
    }
    
    findMarket(game) {
        let best = null;
        let minDist = Infinity;
        game.entities.forEach(e => {
            if (e.constructor.name === 'EconomicBuilding' && e.type === 'MARKET' && !e.remove) {
                const d = Utils.dist(this.x, this.y, e.x, e.y);
                if (d < minDist) { minDist = d; best = e; }
            }
        });
        return best;
    }
    
    wander(dt, game) {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            this.wanderTarget.x = Math.max(0, Math.min(game.canvas.width, this.x + Utils.rand(-100, 100)));
            this.wanderTarget.y = Math.max(0, Math.min(game.canvas.height, this.y + Utils.rand(-100, 100)));
            this.wanderTimer = 3;
        }
        if (Utils.dist(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y) > 10) {
            this.moveTowards(this.wanderTarget.x, this.wanderTarget.y, dt);
        }
    }

    maintainSpace(entities, dt) {
        entities.forEach(e => {
            if (e === this || e.remove) return;
            if (e instanceof Hero || e.constructor.name === 'Monster') {
                const dist = Utils.dist(this.x, this.y, e.x, e.y);
                const combinedRadii = this.radius + (e.radius || 15);
                if (dist < combinedRadii && dist > 0) {
                    const pushStrength = 50 * dt;
                    const angle = Math.atan2(this.y - e.y, this.x - e.x);
                    this.x += Math.cos(angle) * pushStrength;
                    this.y += Math.sin(angle) * pushStrength;
                }
            }
        });
    }

    draw(ctx) {
        if (!this.visible) return;

        Utils.drawSprite(ctx, 'hero', this.x, this.y, 20 + (this.level), this.color);
        ctx.fillStyle = 'red'; ctx.fillRect(this.x - 10, this.y - 25, 20, 4);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(this.x - 10, this.y - 25, 20 * (this.hp / this.maxHp), 4);
        ctx.save(); ctx.fillStyle = 'white'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
        const text = `${this.name} (Lv.${this.level})`;
        ctx.strokeText(text, this.x, this.y - 32); ctx.fillText(text, this.x, this.y - 32);
        if (this.personality.brave < 0.4) { ctx.fillStyle='red'; ctx.fillRect(this.x-12, this.y-42, 4, 4); }
        if (this.personality.greedy > 0.7) { ctx.fillStyle='gold'; ctx.fillRect(this.x-2, this.y-42, 4, 4); }
        if (this.personality.smart > 0.7) { ctx.fillStyle='cyan'; ctx.fillRect(this.x+8, this.y-42, 4, 4); }
        ctx.restore();
    }
}
