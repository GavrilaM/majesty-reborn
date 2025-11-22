import { Utils } from '../utils.js';
import { Projectile } from './Projectile.js';
import { Particle } from './Particle.js';
import { BUILDING_CONFIG } from '../config/BuildingConfig.js';

export class EconomicBuilding {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        
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
    }

    update(dt, game) {
        if (this.hp <= 0) { 
            this.remove = true; 
            this.visitors.forEach(hero => {
                hero.visible = true;
                hero.state = 'IDLE';
            });
            return; 
        }

        // --- CRITICAL FIX: CLEANUP DEAD VISITORS ---
        // If a hero dies inside (e.g. poison, projectile impact after entry), remove them
        this.visitors = this.visitors.filter(h => !h.remove && h.hp > 0);

        // HEAL VISITORS
        if (this.visitors.length > 0) {
            this.visitors.forEach(hero => {
                if (hero.hp < hero.maxHp) {
                    hero.hp += 20 * dt; 
                    if (hero.hp >= hero.maxHp) hero.hp = hero.maxHp;
                }
            });
        }

        if (this.type === 'TOWER') this.updateTowerDefense(dt, game);
        if (this.type === 'MARKET') this.updateMarketTrade(dt, game);
    }

    enter(hero) {
        if (!this.visitors.includes(hero)) {
            this.visitors.push(hero);
            hero.visible = false; 
        }
    }

    exit(hero) {
        const idx = this.visitors.indexOf(hero);
        if (idx !== -1) {
            this.visitors.splice(idx, 1);
            hero.visible = true; 
            hero.x = this.x;
            hero.y = this.y + (this.height/2) + 15; // Spawn at feet
        }
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

    takeDamage(amount, game, source = null) { this.hp -= amount; }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Building Body
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        
        // Roof (Depth effect)
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(-this.width/2 - 5, -this.height/2);
        ctx.lineTo(0, -this.height/2 - 20);
        ctx.lineTo(this.width/2 + 5, -this.height/2);
        ctx.fill();

        // Door
        ctx.fillStyle = this.visitors.length > 0 ? '#000' : '#222';
        ctx.fillRect(-10, this.height/2 - 20, 20, 20);

        ctx.restore();

        if (this.hp < this.maxHp) {
            const barWidth = 40;
            const barY = this.y - (this.height/2) - 25;
            ctx.fillStyle = 'black';
            ctx.fillRect(this.x - barWidth/2, barY, barWidth, 5);
            const pct = Math.max(0, this.hp / this.maxHp);
            ctx.fillStyle = pct > 0.5 ? 'lime' : 'red';
            ctx.fillRect(this.x - barWidth/2, barY, barWidth * pct, 5);
        }
        
        if (this.visitors.length > 0) {
            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${this.visitors.length}`, this.x, this.y + 5); 
        }
    }
}