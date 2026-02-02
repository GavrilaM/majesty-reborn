import { Utils } from '../utils.js';
import { EconomicBuilding } from './EconomicBuilding.js';
import { Particle } from './Particle.js';
import { ItemDrop } from './ItemDrop.js';

export class TaxCollector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 10;
        this.color = '#ffd700'; // Gold color
        this.name = 'Tax Collector';
        this.hp = 50;
        this.maxHp = 50;
        this.speed = 55;
        this.vel = { x: 0, y: 0 };
        this.acc = { x: 0, y: 0 };

        // Combat stats (weak)
        this.dodgeChance = 0.05;
        this.parryChance = 0;
        this.resistPct = 0;

        // Collection
        this.carriedGold = 0;
        this.maxCarry = 100;
        this.collectThreshold = 20; // Minimum treasury to bother collecting
        this.collectRate = 50; // Gold per second collection speed

        this.state = 'IDLE'; // IDLE, MOVING_TO_COLLECT, COLLECTING, RETURNING
        this.target = null; // Building to collect from
        this.depositTarget = null; // Castle or Tower to deposit
        this.collectTimer = 0;

        this.visible = true;
        this.remove = false;
        this.walkPhase = 0;
        this.restingBuilding = null;
    }

    update(dt, game) {
        if (this.hp <= 0) {
            // Drop carried gold on death
            if (this.carriedGold > 0) {
                game.entities.push(new Particle(this.x, this.y - 20, `-${this.carriedGold}g LOST!`, 'red'));
                // Could spawn ItemDrop here if we want gold to be recoverable
            }
            this.remove = true;
            game.queueNpcRespawn('TaxCollector', 20);
            return;
        }

        // Flee if in danger and hurt
        const danger = this.findNearestMonster(game, 100);
        if (danger && this.hp < this.maxHp * 0.5) {
            this.state = 'FLEE';
            this.target = game.castle;
        }

        if (this.state === 'FLEE') {
            this.moveTowards(this.target.x, this.target.y, dt);
            if (Utils.dist(this.x, this.y, this.target.x, this.target.y) < 30) {
                // Deposit any carried gold at castle
                if (this.carriedGold > 0) {
                    game.gold += this.carriedGold;
                    game.entities.push(new Particle(this.x, this.y - 30, `+${this.carriedGold}g`, 'gold'));
                    this.carriedGold = 0;
                }
                this.state = 'IDLE';
            }
            return;
        }

        // IDLE: Find building with gold to collect
        if (this.state === 'IDLE') {
            const building = this.findBuildingWithGold(game);
            if (building) {
                // Exit building if resting inside
                if (this.restingBuilding && this.restingBuilding.exit) {
                    this.restingBuilding.exit(this);
                    this.restingBuilding = null;
                }
                this.visible = true; // Ensure visible
                this.target = building;
                this.state = 'MOVING_TO_COLLECT';
            } else if (this.carriedGold > 0) {
                // Nothing to collect but have gold - return to castle
                if (this.restingBuilding && this.restingBuilding.exit) {
                    this.restingBuilding.exit(this);
                    this.restingBuilding = null;
                }
                this.visible = true;
                this.depositTarget = game.castle;
                this.state = 'RETURNING';
            } else {
                // Rest inside castle
                this.returnToCastle(dt, game);
            }
        }

        // MOVING_TO_COLLECT: Walk to building
        if (this.state === 'MOVING_TO_COLLECT') {
            if (!this.target || this.target.remove) {
                this.state = 'IDLE';
                this.target = null;
                return;
            }

            const d = Utils.dist(this.x, this.y, this.target.x, this.target.y);
            if (d < 40) {
                this.state = 'COLLECTING';
                this.collectTimer = 0;
                this.vel.x = 0; this.vel.y = 0;
            } else {
                this.moveTowards(this.target.x, this.target.y, dt);
            }
        }

        // COLLECTING: Transfer gold from building treasury
        if (this.state === 'COLLECTING') {
            if (!this.target || this.target.remove) {
                this.state = 'IDLE';
                this.target = null;
                return;
            }

            const building = this.target;
            const available = building.treasury || 0;

            if (available <= 0 || this.carriedGold >= this.maxCarry) {
                // Done collecting
                game.entities.push(new Particle(this.x, this.y - 20, `Collected ${this.carriedGold}g`, 'gold'));
                this.depositTarget = game.castle;
                this.state = 'RETURNING';
                return;
            }

            // Collect gold over time
            const toCollect = Math.min(this.collectRate * dt, available, this.maxCarry - this.carriedGold);
            building.treasury -= toCollect;
            this.carriedGold += toCollect;
        }

        // RETURNING: Walk back to Castle and deposit
        if (this.state === 'RETURNING') {
            const target = this.depositTarget || game.castle;
            if (!target || target.remove) {
                this.depositTarget = game.castle;
                return;
            }

            const d = Utils.dist(this.x, this.y, target.x, target.y);
            if (d < 40) {
                // Deposit gold
                if (this.carriedGold > 0) {
                    game.gold += this.carriedGold;
                    game.entities.push(new Particle(target.x, target.y - 40, `+${this.carriedGold}g`, 'lime'));
                    this.carriedGold = 0;
                }
                this.state = 'IDLE';
                this.target = null;
                this.depositTarget = null;
            } else {
                this.moveTowards(target.x, target.y, dt);
            }
        }

        // Apply physics - CRITICAL: without this, the TaxCollector won't move!
        this.integrate(dt, game);
    }

    findBuildingWithGold(game) {
        let best = null;
        let bestScore = -Infinity;

        for (const e of game.entities) {
            const isBuilding = e.constructor.name === 'EconomicBuilding' ||
                e.constructor.name === 'WarriorGuild' ||
                e.constructor.name === 'RangerGuild';

            if (isBuilding && e.constructed && !e.remove && e.treasury >= this.collectThreshold) {
                // Score by treasury amount / distance
                const d = Utils.dist(this.x, this.y, e.x, e.y);
                const score = e.treasury - d * 0.1;
                if (score > bestScore) {
                    bestScore = score;
                    best = e;
                }
            }
        }
        return best;
    }

    findNearestMonster(game, range) {
        let nearest = null;
        let minDist = range;
        for (const e of game.entities) {
            if (e.constructor.name === 'Monster' && !e.remove && e.hp > 0) {
                const d = Utils.dist(this.x, this.y, e.x, e.y);
                if (d < minDist) { minDist = d; nearest = e; }
            }
        }
        return nearest;
    }

    returnToCastle(dt, game) {
        const castle = game.castle;
        if (castle && castle.constructed) {
            const door = { x: castle.x, y: castle.y + (castle.height / 2) - 5 };
            const d = Utils.dist(this.x, this.y, door.x, door.y);
            if (d < 18) {
                if (castle.enter) { castle.enter(this); this.restingBuilding = castle; }
            } else if (this.visible) {
                this.moveTowards(door.x, door.y, dt);
            }
        }
    }

    moveTowards(tx, ty, dt) {
        const dx = tx - this.x, dy = ty - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
            const dir = { x: dx / d, y: dy / d };
            this.acc.x += dir.x * this.speed * 3;
            this.acc.y += dir.y * this.speed * 3;
        }
    }

    integrate(dt, game) {
        // Apply acceleration
        this.vel.x += this.acc.x * dt;
        this.vel.y += this.acc.y * dt;

        // Friction
        this.vel.x *= 0.9;
        this.vel.y *= 0.9;

        // Clamp speed
        const speed = Math.hypot(this.vel.x, this.vel.y);
        if (speed > this.speed) {
            this.vel.x = (this.vel.x / speed) * this.speed;
            this.vel.y = (this.vel.y / speed) * this.speed;
        }

        // Walk animation
        this.walkPhase = (this.walkPhase || 0) + (speed > 0.5 ? speed * 0.05 : 0) * dt * 60;

        // Apply velocity
        this.x += this.vel.x * dt;
        this.y += this.vel.y * dt;

        // Reset acceleration
        this.acc.x = 0;
        this.acc.y = 0;
    }

    takeDamage(amount, game, source = null) {
        if (Math.random() < this.dodgeChance) {
            game.entities.push(new Particle(this.x, this.y - 20, "DODGE", "cyan"));
            return;
        }

        this.hp -= amount;
        game.entities.push(new Particle(this.x, this.y - 20, "-" + Math.floor(amount), "#ff5555"));
    }

    draw(ctx) {
        if (!this.visible) return;

        const vm = Math.hypot(this.vel.x, this.vel.y);
        let oy = 0;
        if (vm > 0.5) oy = Math.sin(this.walkPhase) * 1.2;

        // Body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y + oy, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Money bag indicator if carrying gold
        if (this.carriedGold > 0) {
            ctx.fillStyle = '#8B4513';
            ctx.beginPath();
            ctx.arc(this.x + 8, this.y + oy - 5, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'gold';
            ctx.font = '8px sans-serif';
            ctx.fillText(`${Math.floor(this.carriedGold)}g`, this.x + 5, this.y + oy - 12);
        }

        // HP bar
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - 10, this.y - 15, 20, 3);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(this.x - 10, this.y - 15, 20 * (this.hp / this.maxHp), 3);
    }
}
