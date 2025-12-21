import { Utils } from '../utils.js';
import { Projectile } from './Projectile.js';
import { Particle } from './Particle.js';
import { BUILDING_CONFIG } from '../config/BuildingConfig.js';
import { ITEM_CONFIG } from '../config/ItemConfig.js';

export class EconomicBuilding {
    constructor(x, y, type, game = null) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.game = game; // NEW: Store reference to game for transactions
        this.id = `${type}-${Math.random().toString(36).slice(2, 8)}`;

        const config = BUILDING_CONFIG[type];
        this.name = config.name;
        this.width = config.width;
        this.height = config.height;
        this.maxHp = config.hp;
        this.hp = this.maxHp;
        this.color = config.color;

        this.attackRange = config.attackRange || 0;
        this.damage = config.damage || 0;
        this.attackCooldown = 0;
        this.tradeTimer = 0;
        this.heroesNearby = 0;

        this.visitors = [];
        this.remove = false;
        this.constructed = type === 'CASTLE';
        this.isUnderConstruction = !this.constructed;
        this.opacity = 1.0;
        this.targetOpacity = 1.0;
    }

    update(dt, game) {
        if (this.hp <= 0) {
            // If fully built, 0 HP means destroyed; otherwise it's just unconstructed
            if (this.constructed) {
                this.remove = true;
                this.visitors.forEach(hero => {
                    hero.visible = true;
                    hero.state = 'DECISION';
                });
                return;
            } else {
                // Keep under construction at 0 HP
                this.hp = 0;
            }
        }

        // --- CRITICAL FIX: CLEANUP DEAD VISITORS ---
        // If a hero dies inside (e.g. poison, projectile impact after entry), remove them
        this.visitors = this.visitors.filter(h => !h.remove && h.hp > 0);

        if (this.constructed && this.visitors.length > 0) {
            this.visitors.forEach(hero => {
                if (hero.hp < hero.maxHp) {
                    hero.hp += 20 * dt;
                    if (hero.hp >= hero.maxHp) hero.hp = hero.maxHp;
                }
            });
        }

        if (this.constructed && this.type === 'TOWER') this.updateTowerDefense(dt, game);
        if (this.constructed && this.type === 'MARKET') this.updateMarketTrade(dt, game);

        const margin = 8;
        const x1 = this.x - this.width / 2 - margin;
        const x2 = this.x + this.width / 2 + margin;
        const y1 = this.y - this.height / 2 - margin;
        const y2 = this.y;
        let occluded = false;
        for (const e of game.entities) {
            if (e.remove) continue;
            const isUnit = e.constructor.name === 'Hero' || e.constructor.name === 'Monster' || e.constructor.name === 'Worker' || e.constructor.name === 'CastleGuard';
            if (!isUnit) continue;
            if (!e.visible) continue;
            if (e.x >= x1 && e.x <= x2 && e.y >= y1 && e.y <= y2 && e.y < this.y) { occluded = true; break; }
        }
        this.targetOpacity = occluded ? 0.4 : 1.0;
        const t = Math.min(1, dt * 6);
        this.opacity = Utils.lerp(this.opacity, this.targetOpacity, t);
    }

    enter(hero) {
        if (!this.constructed) return;
        if (!this.visitors.includes(hero)) {
            this.visitors.push(hero);
            hero.visible = false;
            hero.inBuilding = this;
            hero.x = -10000; hero.y = -10000;

            // NEW: If this is a Market, attempt to sell potions
        if (this.type === 'MARKET') {
            this.attemptPotionSale(hero);
        }
        }
    }

    exit(hero) {
        const idx = this.visitors.indexOf(hero);
        if (idx !== -1) {
            this.visitors.splice(idx, 1);
            hero.visible = true;
            hero.inBuilding = null;
            hero.x = this.x;
            hero.y = this.y + (this.height / 2) + 15; // Spawn at feet
        }
    }

    attemptPotionSale(hero) {
        const potionCost = ITEM_CONFIG.POTION.cost; // 30g
        const playerProfit = 10; // Player gets 10g tax per sale

        // Purchase conditions (ALL must be true):
        // 1. Hero needs healing (not at full HP)
        // 2. Hero has enough gold
        // 3. Hero's belt has an empty slot
        const canAfford = hero.gold >= potionCost;
        const hasSpace = !hero.inventory.isBeltFull();

        // PERSONALITY FACTOR: How many potions to buy?
        // - Cowardly heroes: Try to fill belt (buy 2 if possible)
        // - Brave heroes: Buy 1 only
        // - Smart heroes: Calculate based on HP deficit
        const targetPotions = this.calculatePotionsToBuy(hero);

        // Attempt to buy potions until belt is full or conditions fail
        let purchaseCount = 0;
        while (purchaseCount < targetPotions &&
            hero.gold >= potionCost &&
            !hero.inventory.isBeltFull()) {

            // Transaction successful
            hero.gold -= potionCost;
            // console.log(`Hero bought potion. Gold: ${hero.gold}`); // Debug
            const success = hero.inventory.addPotion({
                type: 'POTION',
                name: ITEM_CONFIG.POTION.name,
                healAmount: ITEM_CONFIG.POTION.healAmount
            });

            if (success) {
                purchaseCount++;

                // Player gets tax profit
                if (this.game) {
                    this.game.gold += playerProfit;
                }
            } else {
                // Belt is full (shouldn't happen due to while condition, but safety check)
                break;
            }
        }

        // Visual feedback if any purchases were made
        if (purchaseCount > 0 && this.game) {
            const totalProfit = purchaseCount * playerProfit;
            this.game.entities.push(new Particle(
                this.x,
                this.y - 30,
                `+${totalProfit}g`,
                "yellow"
            ));
        }
    }

    calculatePotionsToBuy(hero) {
        // Cowardly heroes always buy 2 (fill belt for safety)
        if (hero.personality.brave < 0.4) {
            return 2;
        }

        // Very brave heroes only buy 1 (minimal insurance)
        if (hero.personality.brave > 0.8) {
            return 1;
        }

        // Smart heroes calculate based on HP deficit
        if (hero.personality.smart > 0.7) {
            const hpMissing = hero.maxHp - hero.hp;
            const potionsNeeded = Math.ceil(hpMissing / 50); // 50 HP per potion
            return Math.min(potionsNeeded, 2); // Cap at 2 (belt capacity)
        }

        // Default: Buy 1 potion
        return 1;
    }

    updateTowerDefense(dt, game) {
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        if (this.attackCooldown <= 0) {
            let target = null;
            let minDist = this.attackRange;
            game.entities.forEach(e => {
                if (e.constructor.name === 'Monster') {
                    const d = Utils.dist(this.x, this.y, e.x, e.y);
                    if (d < minDist) { minDist = d; target = e; }
                }
            });
            if (target) {
                // Pass 'this' (the tower) as source so monsters know who attacked them
                game.entities.push(new Projectile(this.x, this.y - 30, target, this.damage, this)); // Fire from top
                this.attackCooldown = 1.5;
            }
        }
    }

    updateMarketTrade(dt, game) {
        const range = 150;
        let count = 0;
        game.entities.forEach(e => {
            if (e.constructor.name === 'Hero' && e.visible && Utils.dist(this.x, this.y, e.x, e.y) < range) {
                count++;
            }
        });
        this.heroesNearby = count;

        if (count > 0) {
            this.tradeTimer += dt;
            if (this.tradeTimer > 1.0) {
                this.tradeTimer = 0;
                const profit = count * 1;
                game.gold += profit;
                if (Math.random() < 0.3) {
                    game.entities.push(new Particle(this.x, this.y - 30, `+${profit}g`, "yellow"));
                }
            }
        }
    }

    takeDamage(amount, game, source = null) { if (source && source.remove) return; this.hp -= amount; }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = this.opacity;

        // Building Body
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        if (!this.constructed) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#777';
            ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
            ctx.globalAlpha = 1.0;
            // Hatch lines
            ctx.strokeStyle = '#bbb';
            for (let i = -this.width; i < this.width; i += 10) {
                ctx.beginPath();
                ctx.moveTo(i, -this.height / 2);
                ctx.lineTo(i + this.height, this.height / 2);
                ctx.stroke();
            }
        }

        // Roof (Depth effect)
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(-this.width / 2 - 5, -this.height / 2);
        ctx.lineTo(0, -this.height / 2 - 20);
        ctx.lineTo(this.width / 2 + 5, -this.height / 2);
        ctx.fill();

        // Door
        ctx.fillStyle = this.visitors.length > 0 ? '#000' : '#222';
        ctx.fillRect(-10, this.height / 2 - 20, 20, 20);

        ctx.restore();

        if (this.hp < this.maxHp) {
            const barWidth = 40;
            const barY = this.y - (this.height / 2) - 25;
            ctx.fillStyle = 'black';
            ctx.fillRect(this.x - barWidth / 2, barY, barWidth, 5);
            const pct = Math.max(0, this.hp / this.maxHp);
            ctx.fillStyle = pct > 0.5 ? 'lime' : 'red';
            ctx.fillRect(this.x - barWidth / 2, barY, barWidth * pct, 5);
        }

        // SHOPPING INDICATOR
        if (this.type === 'MARKET' && this.constructed && this.visitors.length > 0) {
            ctx.font = '20px Arial';
            ctx.fillStyle = 'gold';
            ctx.textAlign = 'center';
            ctx.fillText('💰', this.x, this.y - this.height / 2 - 20);
        }

        if (this.visitors.length > 0) {
            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${this.visitors.length}`, this.x, this.y + 5);
        }
    }
}
