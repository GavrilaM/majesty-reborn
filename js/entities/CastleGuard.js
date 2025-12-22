import { Utils } from '../utils.js';
import { CLASS_CONFIG } from '../config/ClassConfig.js';
import { Particle } from './Particle.js';

export class CastleGuard {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 14;
        this.color = '#5c7a99';
        this.name = 'Castle Guard';
        this.hp = 140;
        this.maxHp = 140;
        this.damage = 12;
        this.speed = 62;
        this.vel = { x: 0, y: 0 };
        this.acc = { x: 0, y: 0 };
        this.dodgeChance = 0.06;
        this.parryChance = 0.08;
        this.resistPct = 0.05;
        this.attackCooldown = 0;
        this.state = 'PATROL';
        this.target = null;
        this.lockTimer = 0;
        this.visible = true;
        this.remove = false;
        this.walkPhase = 0;
    }

    update(dt, game) {
        if (this.hp <= 0) { this.remove = true; return; }
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        const threat = this.findNearestMonsterNearCastle(game, 220);
        if (!this.target && threat) { this.state = 'FIGHT'; this.target = threat; this.lockTimer = 3.0; }

        if (this.state === 'FIGHT') {
            if (this.lockTimer > 0) this.lockTimer -= dt;
            if (!this.target || this.target.remove || this.target.hp <= 0) { this.state = 'PATROL'; this.target = null; this.lockTimer = 0; return; }
            const d = Utils.dist(this.x, this.y, this.target.x, this.target.y);
            if (d > 40) { this.moveTowards(this.target.x, this.target.y, dt); }
            else if (this.attackCooldown <= 0) { this.target.takeDamage(this.damage, game, this); this.attackCooldown = 1.4; }
            // If lock expired and a closer threat to castle exists, consider switching
            if (this.lockTimer <= 0) {
                const t2 = this.findNearestMonsterNearCastle(game, 180);
                if (t2 && t2 !== this.target) { this.target = t2; this.lockTimer = 2.0; }
            }
            return;
        }

        if (!this.patrolTarget || this.patrolTimer <= 0) {
            const cx = game.castle.x, cy = game.castle.y;
            const r = 140 + Math.random() * 80;
            const ang = Math.random() * Math.PI * 2;
            this.patrolTarget = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
            this.patrolTimer = 3 + Math.random() * 4;
        }
        this.patrolTimer -= dt;
        this.moveTowards(this.patrolTarget.x, this.patrolTarget.y, dt);
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

    findNearestMonsterNearCastle(game, range) {
        const cx = game.castle.x, cy = game.castle.y;
        let m = null;
        let dMin = range;
        for (const e of game.entities) {
            if (e.constructor.name === 'Monster') {
                const d = Utils.dist(cx, cy, e.x, e.y);
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
        const smooth = Utils.lerpVec(this.vel.x, this.vel.y, desired.x, desired.y, 0.15);
        const steer = { x: smooth.x - this.vel.x, y: smooth.y - this.vel.y };
        const limited = Utils.limitVec(steer.x, steer.y, this.speed * 3);
        this.acc.x += limited.x; this.acc.y += limited.y;
    }

    draw(ctx) {
        if (!this.visible) return;
        const vm = Math.hypot(this.vel.x, this.vel.y);
        const oy = vm > 0.5 ? Math.sin(this.walkPhase || 0) * 1.2 : 0;
        Utils.drawSprite(ctx, 'hero', this.x, this.y + oy, this.radius * 2, this.color);
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
        if (game) game.entities.push(new Particle(this.x, this.y - 20, '-' + Math.floor(amount), '#99c2ff'));
        if (this.hp <= 0) { this.remove = true; if (game && game.queueNpcRespawn) game.queueNpcRespawn('CastleGuard', 15); }
    }

    integrate(dt, game) {
        this.vel.x += this.acc.x * dt;
        this.vel.y += this.acc.y * dt;
        const friction = 0.97;
        this.vel.x *= friction;
        this.vel.y *= friction;
        const limited = Utils.limitVec(this.vel.x, this.vel.y, this.speed);
        this.vel.x = limited.x; this.vel.y = limited.y;
        const velMag = Math.hypot(this.vel.x, this.vel.y);
        this.walkPhase = this.walkPhase + (velMag > 0.5 ? velMag * 0.05 : 0) * dt * 60;
        if (velMag < 0.02) { this.vel.x = 0; this.vel.y = 0; }
        this.x += this.vel.x * dt;
        this.y += this.vel.y * dt;
        this.acc.x = 0; this.acc.y = 0;
    }
}
