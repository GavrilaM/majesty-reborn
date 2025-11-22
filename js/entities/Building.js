import { Utils } from '../utils.js';
import { Particle } from './Particle.js';

export class Building {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 'castle', 'guild', etc.
        
        this.width = 60;
        this.height = 60;
        
        this.maxHp = 500; // Castles are tough
        this.hp = this.maxHp;
        this.remove = false;
    }

    update(dt, game) {
        // Buildings don't move (usually)
        // But we can regenerate HP slowly?
        if (this.hp < this.maxHp) {
            this.hp += 1 * dt; // Repair 1 HP per second automatically
        }
    }

    takeDamage(amount, game, source = null) {
        this.hp -= amount;
        
        // Visual feedback
        if (game && Math.random() < 0.3) { // Don't spam particles too much
            game.entities.push(new Particle(this.x, this.y - 40, "-1", "orange"));
        }

        if (this.hp <= 0) {
            this.hp = 0;
            // We don't set remove=true immediately for the castle, 
            // because we want to trigger Game Over logic in Game.js
        }
    }

    draw(ctx) {
        // Draw the building sprite
        Utils.drawSprite(ctx, 'building', this.x, this.y, 40, null);

        // Draw Health Bar
        const barWidth = 60;
        const hpPercent = this.hp / this.maxHp;
        
        ctx.fillStyle = 'black';
        ctx.fillRect(this.x - barWidth/2, this.y - 50, barWidth, 6);
        
        ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(this.x - barWidth/2, this.y - 50, barWidth * hpPercent, 6);
    }
}