import { Utils } from '../utils.js';
import { EconomicBuilding } from './EconomicBuilding.js';
import { Particle } from './Particle.js';

export class Worker {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 12;
        this.color = '#c2b280';
        this.name = 'Worker';
        this.hp = 70;
        this.maxHp = 70;
        this.speed = 55;
        this.vel = { x: 0, y: 0 };
        this.acc = { x: 0, y: 0 };
        this.buildRate = 25;
        this.repairRate = 20;
        this.dodgeChance = 0.03;
        this.parryChance = 0.02;
        this.resistPct = 0.02;
        this.state = 'IDLE';
        this.target = null;
        this.visible = true;
        this.remove = false;
        this.restingBuilding = null;
    }

    update(dt, game) {
        if (this.hp <= 0) { this.remove = true; return; }

        const danger = this.findNearestMonster(game, 120);
        if (danger && this.hp < this.maxHp * 0.3) {
            this.state = 'FLEE';
            this.target = game.castle;
        }

        if (this.state === 'FLEE') {
            this.moveTowards(this.target.x, this.target.y, dt);
            if (Utils.dist(this.x, this.y, this.target.x, this.target.y) < 24) this.state = 'IDLE';
            return;
        }

        if (!this.target || this.target.remove) {
            const b = this.findWorkTarget(game);
            if (b) { 
                // If resting inside castle, exit
                if (!this.visible && this.restingBuilding && this.restingBuilding.exit) {
                    this.restingBuilding.exit(this);
                    this.restingBuilding = null;
                }
                this.target = b; this.state = 'MOVE'; 
            } else { 
                this.state = 'IDLE';
            }
        }

        if (this.state === 'MOVE') {
            const door = { x: this.target.x, y: this.target.y + (this.target.height/2) - 5 };
            const d = Utils.dist(this.x, this.y, door.x, door.y);
            if (d < 18) {
                this.state = this.target.constructed ? 'REPAIR' : 'BUILD';
                // Stop movement when starting work
                this.vel.x = 0; this.vel.y = 0;
                this.acc.x = 0; this.acc.y = 0;
            } else {
                this.moveTowards(door.x, door.y, dt);
            }
        } else if (this.state === 'BUILD') {
            if (this.target.constructed) { this.state = 'IDLE'; this.target = null; return; }
            this.target.hp = Math.min(this.target.maxHp, this.target.hp + this.buildRate * dt);
            if (this.target.hp >= this.target.maxHp) { this.target.constructed = true; this.target.isUnderConstruction = false; }
        } else if (this.state === 'REPAIR') {
            if (!this.target.constructed) { this.state = 'IDLE'; this.target = null; return; }
            if (this.target.hp >= this.target.maxHp) { this.state = 'IDLE'; this.target = null; return; }
            this.target.hp = Math.min(this.target.maxHp, this.target.hp + this.repairRate * dt);
        } else if (this.state === 'IDLE') {
            // Return inside Castle to rest if nothing to do
            const castle = game.castle;
            if (castle && castle.constructed) {
                const door = { x: castle.x, y: castle.y + (castle.height/2) - 5 };
                const d = Utils.dist(this.x, this.y, door.x, door.y);
                if (d < 18) {
                    if (castle.enter) { castle.enter(this); this.restingBuilding = castle; }
                } else if (this.visible) {
                    this.moveTowards(door.x, door.y, dt);
                }
            }
        }
    }

    findWorkTarget(game) {
        let best = null;
        let bestScore = -Infinity;
        for (const e of game.entities) {
            if (e instanceof EconomicBuilding || e.constructor.name === 'EconomicBuilding') {
                if (!e.constructed) {
                    const s = 1000 - Utils.dist(this.x, this.y, e.x, e.y);
                    if (s > bestScore) { bestScore = s; best = e; }
                } else if (e.hp < e.maxHp) {
                    const s = 500 - Utils.dist(this.x, this.y, e.x, e.y);
                    if (s > bestScore) { bestScore = s; best = e; }
                }
            }
        }
        return best;
    }

    findNearestMonster(game, range) {
        let m = null;
        let dMin = range;
        for (const e of game.entities) {
            if (e.constructor.name === 'Monster') {
                const d = Utils.dist(this.x, this.y, e.x, e.y);
                if (d < dMin) { dMin = d; m = e; }
            }
        }
        return m;
    }

    moveTowards(tx, ty, dt) {
        const dx = tx - this.x, dy = ty - this.y;
        const dist = Math.hypot(dx, dy);
        const dir = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 0, y: 0 };
        const arriveRadius = 50;
        const stopRadius = 5;
        let desiredSpeed;
        if (dist < stopRadius) {
            desiredSpeed = 0;
            this.vel.x = 0; this.vel.y = 0;
        } else if (dist < arriveRadius) {
            const t = (dist - stopRadius) / (arriveRadius - stopRadius);
            desiredSpeed = this.speed * t * t;
        } else {
            desiredSpeed = this.speed;
        }
        const desired = { x: dir.x * desiredSpeed, y: dir.y * desiredSpeed };
        const steer = { x: desired.x - this.vel.x, y: desired.y - this.vel.y };
        const limited = Utils.limitVec(steer.x, steer.y, this.speed * 3);
        this.acc.x += limited.x; this.acc.y += limited.y;
    }

    draw(ctx) {
        if (!this.visible) return;
        // Body like hero
        Utils.drawSprite(ctx, 'hero', this.x, this.y, this.radius * 2, this.color);
        // HP bar
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - 10, this.y - 15, 20, 3);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(this.x - 10, this.y - 15, 20 * (this.hp / this.maxHp), 3);
        // Name
        ctx.save();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeText(this.name, this.x, this.y - 22);
        ctx.fillText(this.name, this.x, this.y - 22);
        ctx.restore();
    }

    takeDamage(amount, game, source = null) {
        if (Math.random() < this.dodgeChance) { if (game) game.entities.push(new Particle(this.x, this.y - 20, 'DODGE', 'cyan')); return; }
        if (Math.random() < this.parryChance) { amount *= 0.5; if (game) game.entities.push(new Particle(this.x, this.y - 20, 'PARRY', 'white')); }
        if (this.resistPct > 0) { amount -= amount * this.resistPct; }
        this.hp -= amount;
        if (game) game.entities.push(new Particle(this.x, this.y - 20, '-' + Math.floor(amount), 'orange'));
        if (this.hp <= 0) { this.remove = true; if (game && game.queueNpcRespawn) game.queueNpcRespawn('Worker', 15); }
    }

    integrate(dt, game) {
        if (this.state === 'BUILD' || this.state === 'REPAIR') {
            // Keep anchored at work spot
            this.vel.x = 0; this.vel.y = 0;
            this.acc.x = 0; this.acc.y = 0;
            return;
        }
        this.vel.x += this.acc.x * dt;
        this.vel.y += this.acc.y * dt;
        // Apply friction
        const friction = 0.97;
        this.vel.x *= friction;
        this.vel.y *= friction;
        const limited = Utils.limitVec(this.vel.x, this.vel.y, this.speed);
        this.vel.x = limited.x; this.vel.y = limited.y;
        const velMag = Math.hypot(this.vel.x, this.vel.y);
        if (velMag < 0.02) { this.vel.x = 0; this.vel.y = 0; }
        this.x += this.vel.x * dt;
        this.y += this.vel.y * dt;
        this.acc.x = 0; this.acc.y = 0;
    }
}
