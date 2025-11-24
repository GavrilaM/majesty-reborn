// ... (Keep imports) ...
import { Hero } from './entities/Hero.js';
import { Monster } from './entities/Monster.js';
import { Flag } from './entities/Flag.js';
import { Projectile } from './entities/Projectile.js';
import { Particle } from './entities/Particle.js';
import { EconomicBuilding } from './entities/EconomicBuilding.js';
import { ItemDrop } from './entities/ItemDrop.js';
import { UIManager } from './managers/UIManager.js';
import { BuildManager } from './managers/BuildManager.js';
import { Utils } from './utils.js';

class Game {
    constructor() {
        // ... (Keep constructor exactly as is) ...
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.lastTime = 0;
        this.gameTime = 0;
        this.entities = [];
        this.gold = 1000; 
        this.flagMode = false;
        this.gameOver = false;
        this.taxTimer = 0;
        this.taxInterval = 5; 
        this.ui = new UIManager(this);
        this.builder = new BuildManager(this);
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.mouseX = 0;
        this.mouseY = 0;
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
        });
        this.castle = new EconomicBuilding(this.canvas.width/2, this.canvas.height/2, 'CASTLE', this);
        this.entities.push(this.castle);
        this.setupInputs();
        this.loop(0);
    }

    // ... (Keep setupInputs, resize, recruit, toggleFlagMode, handleClick, updateUI) ...
    setupInputs() {
        this.canvas.addEventListener('mousedown', (e) => this.handleClick(e));
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.builder.cancelBuild();
            if(this.flagMode) this.toggleFlagMode();
            this.ui.deselect();
        });
    }

    resize() {
        this.canvas.width = window.innerWidth - 240;
        this.canvas.height = window.innerHeight;
    }
    
    recruit(type) {
        if (this.gold >= 200) {
            this.gold -= 200;
            let spawnX = this.castle.x;
            let spawnY = this.castle.y + 60;
            if (this.ui.selectedEntity && this.ui.selectedEntity.type === 'GUILD') {
                spawnX = this.ui.selectedEntity.x;
                spawnY = this.ui.selectedEntity.y + 50;
            }
            this.entities.push(new Hero(spawnX, spawnY, type));
        }
    }

    toggleFlagMode() {
        this.flagMode = !this.flagMode;
        this.builder.cancelBuild();
        this.ui.deselect();
        document.body.style.cursor = this.flagMode ? 'crosshair' : 'default';
    }

    handleClick(e) {
        const x = this.mouseX;
        const y = this.mouseY;
        if (this.builder.handleClick(x, y)) return;

        let clicked = null;
        
        // Check UI Selection (prioritize units over buildings)
        // Sort by distance to mouse to click the "top" thing
        const candidates = this.entities.filter(ent => {
            if (ent.constructor.name === 'Hero') return Utils.dist(x, y, ent.x, ent.y) < (ent.radius || 15) + 10;
            if (ent.constructor.name === 'Monster') return Utils.dist(x, y, ent.x, ent.y) < (ent.radius || 12) + 10;
            if (ent.constructor.name === 'EconomicBuilding') return Math.abs(x - ent.x) < ent.width/2 + 5 && Math.abs(y - ent.y) < ent.height/2 + 5;
            return false;
        });
        
        // Pick closest
        if (candidates.length > 0) {
            candidates.sort((a, b) => Utils.dist(x, y, a.x, a.y) - Utils.dist(x, y, b.x, b.y));
            clicked = candidates[0];
        }

        if (clicked) {
            this.ui.select(clicked);
            return; 
        }

        if (this.flagMode && this.gold >= 100) {
            this.gold -= 100;
            this.entities.push(new Flag(x, y, 100));
            this.toggleFlagMode();
        } else if (!clicked) {
            this.ui.deselect();
        }
    }

    updateUI() {
        // Refresh UI display - delegates to UIManager
        // This is called after state changes (e.g., building placement)
        if (this.ui.selectedEntity) {
            if (this.ui.selectedEntity.constructor.name === 'Hero') {
                this.ui.updateHeroData();
            } else if (this.ui.selectedEntity.constructor.name === 'EconomicBuilding') {
                this.ui.updateBuildingData();
            }
        }
    }

    update(dt) {
        if (this.gameOver) return;
        this.gameTime += dt;
        this.taxTimer -= dt;
        if (this.taxTimer <= 0) {
            this.taxTimer = this.taxInterval;
            let income = 25;
            this.gold += income;
            this.entities.push(new Particle(this.castle.x, this.castle.y - 60, `+${income}g`, "yellow"));
        }
        if (this.castle.hp <= 0) { this.endGame(); return; }
        if (Math.random() < 0.005) {
            const x = Math.random() < 0.5 ? 0 : this.canvas.width;
            const y = Math.random() * this.canvas.height;
            const type = Math.random() < 0.8 ? 'SWARM' : 'TANK';
            this.entities.push(new Monster(x, y, type));
        }
        this.entities.forEach(e => e.update(dt, this));
        this.entities = this.entities.filter(e => !e.remove);
        this.ui.update(dt);
    }

    draw() {
        this.ctx.fillStyle = '#2c3e50';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const getEntityBottomY = (ent) => {
            if (ent.constructor.name === 'EconomicBuilding') return ent.y + ent.height / 2 - 10;
            if (ent.constructor.name === 'Building') return ent.y + (ent.height || 60) / 2 - 10;
            if (ent.constructor.name === 'Hero' || ent.constructor.name === 'Monster') return ent.y + (ent.radius || 15);
            return ent.y;
        };

        const groundLayer = this.entities.filter(e => e.constructor.name === 'Flag' || e.constructor.name === 'ItemDrop');
        const entityLayer = this.entities.filter(e =>
            e.constructor.name === 'EconomicBuilding' ||
            e.constructor.name === 'Building' ||
            e.constructor.name === 'Hero' ||
            e.constructor.name === 'Monster'
        );
        const effectsLayer = this.entities.filter(e => e.constructor.name === 'Particle' || e.constructor.name === 'Projectile');

        entityLayer.sort((a, b) => getEntityBottomY(a) - getEntityBottomY(b));

        groundLayer.forEach(e => e.draw(this.ctx));
        entityLayer.forEach(e => e.draw(this.ctx));
        effectsLayer.forEach(e => e.draw(this.ctx));
        this.builder.drawPreview(this.ctx, this.mouseX, this.mouseY);
    }

    endGame() {
        this.gameOver = true;
        document.getElementById('game-over-screen').classList.remove('hidden');
    }

    loop(timestamp) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        const safeDt = Math.min(dt, 0.1);
        this.update(safeDt);
        this.draw();
        if (!this.gameOver) requestAnimationFrame((t) => this.loop(t));
    }
}

const game = new Game();
