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
        this.recruitQueue = []; // PACING: Queue for hero training
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.mouseX = 0;
        this.mouseY = 0;
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
        });
        this.castle = new EconomicBuilding(this.canvas.width / 2, this.canvas.height / 2, 'CASTLE', this);
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
            if (this.flagMode) this.toggleFlagMode();
            this.ui.deselect();
        });
    }

    resize() {
        this.canvas.width = window.innerWidth - 240;
        this.canvas.height = window.innerHeight;
    }

    recruit(type, sourceBuilding = null) {
        const cost = type === 'RANGER' ? 350 : 200;
        const trainTime = type === 'RANGER' ? 3.0 : 2.0;
        if (this.gold >= cost) {
            this.gold -= cost;
            // PACING: Add to queue instead of instant spawn
            // Store source building to spawn at correct location
            this.recruitQueue.push({ type: type, timer: trainTime, source: sourceBuilding });

            const fxX = sourceBuilding ? sourceBuilding.x : this.castle.x;
            const fxY = sourceBuilding ? sourceBuilding.y - 40 : this.castle.y - 80;
            this.entities.push(new Particle(fxX, fxY, `Training ${type}...`, "cyan"));

            // Force UI update to show progress immediately
            this.ui.updateBuildingData();
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
            if (ent instanceof Hero) return Utils.dist(x, y, ent.x, ent.y) < ent.radius + 10;
            if (ent.constructor.name === 'Monster') return Utils.dist(x, y, ent.x, ent.y) < ent.radius + 10;
            if (ent instanceof EconomicBuilding) return Math.abs(x - ent.x) < ent.width / 2 + 5 && Math.abs(y - ent.y) < ent.height / 2 + 5;
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

        // PACING: Process Recruitment Queue
        if (this.recruitQueue.length > 0) {
            const nextRecruit = this.recruitQueue[0];
            nextRecruit.timer -= dt;
            if (nextRecruit.timer <= 0) {
                this.recruitQueue.shift();

                let spawnX = this.castle.x;
                let spawnY = this.castle.y + 60;

                // Spawn at source building if it exists
                if (nextRecruit.source && !nextRecruit.source.remove) {
                    spawnX = nextRecruit.source.x;
                    spawnY = nextRecruit.source.y + 50;
                }

                this.entities.push(new Hero(spawnX, spawnY, nextRecruit.type));
                this.entities.push(new Particle(spawnX, spawnY - 40, "Ready!", "lime"));
            }
        }

        if (this.castle.hp <= 0) { this.endGame(); return; }
        // PACING: Reduced spawn rate (0.005 -> 0.002)
        if (Math.random() < 0.002) {
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

        // --- Z-SORTING FIX: Sort by bottom Y (feet level) ---
        this.entities.sort((a, b) => {
            // Calculate bottom Y coordinate (feet level) for proper depth sorting
            let aBottomY = a.y;
            let bBottomY = b.y;

            // Buildings: y is center, bottom is y + height/2
            // Adjust offset to push buildings slightly behind units on doorstep
            if (a.constructor.name === 'EconomicBuilding') {
                aBottomY = a.y + a.height / 2 - 10; // Push buildings behind units
            } else if (a.constructor.name === 'Building') {
                aBottomY = a.y + (a.height || 60) / 2 - 10;
            } else if (a instanceof Hero || a.constructor.name === 'Monster') {
                // Units: y is center, feet are at y + radius (or slightly below)
                aBottomY = a.y + (a.radius || 15);
            }

            if (b.constructor.name === 'EconomicBuilding') {
                bBottomY = b.y + b.height / 2 - 10; // Push buildings behind units
            } else if (b.constructor.name === 'Building') {
                bBottomY = b.y + (b.height || 60) / 2 - 10;
            } else if (b instanceof Hero || b.constructor.name === 'Monster') {
                bBottomY = b.y + (b.radius || 15);
            }

            // Sort by bottom Y - entities with lower bottom Y render first (behind)
            return aBottomY - bBottomY;
        });

        this.entities.forEach(e => e.draw(this.ctx));
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
