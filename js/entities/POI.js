import { Utils } from '../utils/Utils.js';
import { Particle } from './Particle.js';

/**
 * POI (Point of Interest) - Exploreable entities in the world
 * Types: TREASURE (gold loot), DEN (monster spawner)
 */
export class POI {
    constructor(x, y, type, game) {
        this.x = x;
        this.y = y;
        this.type = type; // 'TREASURE' | 'DEN'
        this.game = game;

        // Visual properties
        this.width = 24;
        this.height = 24;
        this.remove = false;
        this.discovered = false; // Has any hero seen this?

        // Type-specific properties
        if (type === 'TREASURE') {
            this.goldValue = 100 + Math.floor(Math.random() * 200); // 100-300g
            this.color = '#ffd700';
            this.interactRadius = 20;
        } else if (type === 'DEN') {
            this.color = '#4a0e0e';
            this.interactRadius = 60; // Detection radius for threat
            this.spawnTimer = 0;
            this.spawnInterval = 30; // Spawn monster every 30s
            this.monstersSpawned = 0;
            this.maxSpawns = 3; // Stop spawning after 3 monsters
            this.hp = 100;
            this.maxHp = 100;
        }
    }

    update(dt, game) {
        if (this.remove) return;

        // DEN spawns monsters periodically
        if (this.type === 'DEN' && this.monstersSpawned < this.maxSpawns) {
            this.spawnTimer += dt;
            if (this.spawnTimer >= this.spawnInterval) {
                this.spawnTimer = 0;
                this.spawnMonster(game);
            }
        }
    }

    /**
     * Hero interacts with this POI
     */
    interact(hero, game) {
        if (this.remove) return;

        if (this.type === 'TREASURE') {
            // Loot the treasure
            hero.gold += this.goldValue;
            hero.history.goldEarned = (hero.history.goldEarned || 0) + this.goldValue;

            // Visual feedback
            game.entities.push(new Particle(
                this.x, this.y - 20,
                `+${this.goldValue}g`,
                '#ffd700'
            ));

            // Destroy treasure after looting
            this.remove = true;
        }
    }

    /**
     * DEN takes damage (can be destroyed by heroes)
     */
    takeDamage(amount, game, source = null) {
        if (this.type !== 'DEN') return;

        this.hp -= amount;
        if (this.hp <= 0) {
            this.remove = true;
            game.entities.push(new Particle(
                this.x, this.y - 20,
                'Den Destroyed!',
                '#27ae60'
            ));
        }
    }

    /**
     * Spawn a weak monster from the DEN
     */
    spawnMonster(game) {
        if (!game.Monster) return; // Safety check

        // Spawn point near den
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 20;
        const spawnX = this.x + Math.cos(angle) * dist;
        const spawnY = this.y + Math.sin(angle) * dist;

        // Create a weak monster
        const monster = new game.Monster(spawnX, spawnY, {
            level: 1,
            type: 'RAT', // Weak rodent type
            maxHp: 30,
            hp: 30,
            damage: 5,
            goldValue: 10,
            xpValue: 5
        });

        game.entities.push(monster);
        this.monstersSpawned++;

        // Visual effect
        game.entities.push(new Particle(
            this.x, this.y - 10,
            '* spawn *',
            '#8b0000'
        ));
    }

    /**
     * Check if a point is within interaction range
     */
    isInRange(x, y) {
        return Utils.dist(this.x, this.y, x, y) < this.interactRadius;
    }

    draw(ctx) {
        if (this.remove) return;

        ctx.save();

        if (this.type === 'TREASURE') {
            // Draw treasure chest
            ctx.fillStyle = this.color;
            ctx.strokeStyle = '#b8860b';
            ctx.lineWidth = 2;

            // Chest body
            ctx.fillRect(this.x - 12, this.y - 8, 24, 16);
            ctx.strokeRect(this.x - 12, this.y - 8, 24, 16);

            // Chest lid
            ctx.beginPath();
            ctx.arc(this.x, this.y - 8, 12, Math.PI, 0);
            ctx.fill();
            ctx.stroke();

            // Sparkle effect
            if (Math.random() < 0.1) {
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(
                    this.x + Utils.rand(-10, 10),
                    this.y + Utils.rand(-12, 5),
                    2, 0, Math.PI * 2
                );
                ctx.fill();
            }

        } else if (this.type === 'DEN') {
            // Draw monster den (dark pit)
            ctx.fillStyle = this.color;
            ctx.strokeStyle = '#2d0808';
            ctx.lineWidth = 3;

            // Pit opening (ellipse)
            ctx.beginPath();
            ctx.ellipse(this.x, this.y, 18, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Inner darkness
            ctx.fillStyle = '#1a0505';
            ctx.beginPath();
            ctx.ellipse(this.x, this.y, 12, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // HP bar if damaged
            if (this.hp < this.maxHp) {
                const barWidth = 30;
                const barHeight = 4;
                const hpPct = this.hp / this.maxHp;

                ctx.fillStyle = '#333';
                ctx.fillRect(this.x - barWidth / 2, this.y - 20, barWidth, barHeight);
                ctx.fillStyle = '#e74c3c';
                ctx.fillRect(this.x - barWidth / 2, this.y - 20, barWidth * hpPct, barHeight);
            }
        }

        // Discovery indicator (exclamation mark) if recently discovered
        if (this.discovered && this.discoveryFlash > 0) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('!', this.x, this.y - 25);
            this.discoveryFlash -= 0.016; // Fade out
        }

        ctx.restore();
    }

    /**
     * Mark as discovered by a hero
     */
    markDiscovered(hero, game) {
        if (this.discovered) return;

        this.discovered = true;
        this.discoveryFlash = 1.0; // Flash duration

        // Particle effect
        const msg = this.type === 'TREASURE' ? 'Treasure!' : 'Danger!';
        const color = this.type === 'TREASURE' ? '#ffd700' : '#e74c3c';
        game.entities.push(new Particle(hero.x, hero.y - 40, msg, color));
    }
}
