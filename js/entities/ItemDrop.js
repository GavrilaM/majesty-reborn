import { Utils } from '../utils.js';
import { Particle } from './Particle.js';
import { ITEM_CONFIG } from '../config/ItemConfig.js';

export class ItemDrop {
    constructor(x, y, itemType) {
        this.x = x;
        this.y = y;
        this.itemType = itemType; // 'POTION', 'POTION_MINOR', etc.
        this.config = ITEM_CONFIG[itemType];
        
        this.remove = false;
        this.radius = 10;
        this.bobTimer = 0; // For floating animation
        this.pickupCooldown = 0.5; // Prevent instant re-pickup after drop
    }

    update(dt, game) {
        this.bobTimer += dt * 3; // Bob up and down
        this.pickupCooldown -= dt;
        
        if (this.pickupCooldown > 0) return; // Can't be picked up yet
        
        // Check if any hero is nearby and wants to pick it up
        game.entities.forEach(e => {
            if (e.constructor.name === 'Hero' && e.visible && !e.remove && e.hp > 0) {
                const dist = Utils.dist(this.x, this.y, e.x, e.y);
                
                // Pickup conditions:
                // 1. Hero is within pickup range (20 pixels)
                // 2. Hero is greedy (greedy > 0.6) OR hero has empty belt slot and is wounded
                const isGreedy = e.personality.greedy > 0.6;
                const needsPotion = e.hp < e.maxHp * 0.7 && !e.inventory.isBeltFull();
                
                if (dist < 20 && (isGreedy || needsPotion)) {
                    // Try to add to hero's belt
                    const success = e.inventory.addPotion({
                        type: this.itemType,
                        name: this.config.name,
                        healAmount: this.config.healAmount
                    });
                    
                    if (success) {
                        this.remove = true;
                        game.entities.push(new Particle(e.x, e.y - 30, "+Potion", "cyan"));
                    }
                }
            }
        });
    }

    draw(ctx) {
        const yOffset = Math.sin(this.bobTimer) * 3; // Bobbing effect
        
        ctx.save();
        ctx.translate(this.x, this.y + yOffset);
        
        // Draw potion bottle
        ctx.fillStyle = '#e74c3c'; // Red potion liquid
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Glass bottle outline
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Cork/cap
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(-3, -8, 6, 3);
        
        // Glow effect (pulsing)
        ctx.globalAlpha = 0.3 + Math.sin(this.bobTimer * 2) * 0.2;
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

