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
        this.speed = 50;
        this.dodgeChance = 0.06;
        this.parryChance = 0.08;
        this.resistPct = 0.05;
        this.attackCooldown = 0;
        this.state = 'PATROL';
        this.target = null;
        this.visible = true;
        this.remove = false;
    }

    update(dt, game) {
        if (this.hp <= 0) { this.remove = true; return; }
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        const threat = this.findNearestMonsterNearCastle(game, 220);
        if (threat) { this.state = 'FIGHT'; this.target = threat; }

        if (this.state === 'FIGHT') {
            if (!this.target || this.target.remove || this.target.hp <= 0) { this.state = 'PATROL'; this.target = null; return; }
            const d = Utils.dist(this.x, this.y, this.target.x, this.target.y);
            if (d > 40) { this.moveTowards(this.target.x, this.target.y, dt); }
            else if (this.attackCooldown <= 0) { this.target.takeDamage(this.damage, game, this); this.attackCooldown = 1.4; }
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
        const angle = Math.atan2(ty - this.y, tx - this.x);
        this.x += Math.cos(angle) * this.speed * dt;
        this.y += Math.sin(angle) * this.speed * dt;
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
        if (game) game.entities.push(new Particle(this.x, this.y - 20, '-' + Math.floor(amount), '#99c2ff'));
        if (this.hp <= 0) this.remove = true;
    }
}
