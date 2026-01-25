import { Utils } from '../utils.js';

export class Projectile {
    constructor(x, y, target, damage, source = null, color = "white") {
        this.x = x;
        this.y = y;
        this.target = target;
        this.damage = damage;
        this.source = source; // Who fired this projectile (Hero, Tower, etc.)
        this.color = color;
        this.speed = 200; // Fast!
        this.remove = false;
    }

    update(dt, game) {
        if (this.target.remove || this.target.hp <= 0) {
            this.remove = true; // Target is already dead
            return;
        }

        // Move towards target
        const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        this.x += Math.cos(angle) * this.speed * dt;
        this.y += Math.sin(angle) * this.speed * dt;

        // Hit detection
        const dist = Utils.dist(this.x, this.y, this.target.x, this.target.y);
        if (dist < 10) {
            // HIT! Pass the source so target knows who to blame
            this.target.takeDamage(this.damage, game, this.source);

            // Create Damage Number
            // We need to import Particle, but to avoid circular imports, 
            // we can check if the game has a method for it or handle it in Game.js
            // For now, let's just assume the target handles its own damage display

            this.remove = true;
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}
