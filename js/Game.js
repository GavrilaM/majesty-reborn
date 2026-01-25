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
import { Worker } from './entities/Worker.js';
import { CastleGuard } from './entities/CastleGuard.js';
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
        this.debugMode = false;
        this.ui = new UIManager(this);
        this.builder = new BuildManager(this);
        this.recruitQueue = []; // PACING: Queue for hero training
        this.flowCell = 64;
        this.flowCache = new Map(); // key -> { vecX, vecY, cols, rows, ox, oy, cell, ts }
        this.npcRespawns = [];
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
        this.castle.constructed = true;
        this.castle.isUnderConstruction = false;
        this.castle.level = 1;
        this.entities.push(this.castle);
        this.spawnInitialNPCs();
        this.setupInputs();
        this.loop(0);
    }

    spawnInitialNPCs() {
        const c = this.castle;
        const w1 = new Worker(c.x + 30, c.y + 60);
        this.entities.push(w1);
        const guardCount = 1;
        for (let i = 0; i < guardCount; i++) {
            const g = new CastleGuard(c.x - 40 + i * 30, c.y + 40);
            this.entities.push(g);
        }
    }

    queueNpcRespawn(type, delay = 15) {
        this.npcRespawns.push({ type, timer: delay });
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
        window.addEventListener('keydown', (e) => {
            if (e.key === 'F3') {
                this.debugMode = !this.debugMode;
                const msg = document.getElementById('game-msg');
                if (msg) msg.innerText = this.debugMode ? 'Debug Overlay: ON' : 'Debug Overlay: OFF';
                const btn = document.getElementById('btn-debug');
                if (btn) btn.innerText = this.debugMode ? 'DEBUG ON' : 'DEBUG OFF';
                this.entities.push(new Particle(this.castle.x, this.castle.y - 80, this.debugMode ? 'Debug ON' : 'Debug OFF', this.debugMode ? 'lime' : 'red'));
            }
        });
        const btnDebug = document.getElementById('btn-debug');
        if (btnDebug) {
            btnDebug.innerText = 'DEBUG OFF';
            btnDebug.onclick = () => {
                this.debugMode = !this.debugMode;
                btnDebug.innerText = this.debugMode ? 'DEBUG ON' : 'DEBUG OFF';
                const msg = document.getElementById('game-msg');
                if (msg) msg.innerText = this.debugMode ? 'Debug Overlay: ON' : 'Debug Overlay: OFF';
                this.entities.push(new Particle(this.castle.x, this.castle.y - 80, this.debugMode ? 'Debug ON' : 'Debug OFF', this.debugMode ? 'lime' : 'red'));
            };
        }
    }

    resize() {
        this.canvas.width = window.innerWidth - 240;
        this.canvas.height = window.innerHeight;
    }

    recruit(type, sourceBuilding = null) {
        const cost = type === 'RANGER' ? 350 : 200;
        const trainTime = type === 'RANGER' ? 3.0 : 2.0;
        const allowed = !sourceBuilding || !sourceBuilding.allowedRecruits ? true : sourceBuilding.allowedRecruits.includes(type);
        if (this.gold >= cost && allowed) {
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

    getDoorPoint(building) {
        // FIX: Handle buildings without height property (Castle uses width/height from canvas drawing)
        const height = building.height || 80; // Default 80px if height undefined
        return { x: building.x, y: building.y + (height / 2) - 5 };
    }

    getObstacles() {
        const margin = 12;
        return this.entities
            .filter(e => e instanceof EconomicBuilding || e.constructor.name === 'EconomicBuilding')
            .map(b => ({
                x1: b.x - b.width / 2 - margin,
                y1: b.y - b.height / 2 - margin,
                x2: b.x + b.width / 2 + margin,
                y2: b.y + b.height / 2 + margin
            }));
    }

    computeFlowField(targetX, targetY) {
        const cell = this.flowCell;
        const cols = Math.ceil(this.canvas.width / cell);
        const rows = Math.ceil(this.canvas.height / cell);
        const ox = 0, oy = 0;
        const dist = new Array(cols * rows).fill(Infinity);
        const idx = (cx, cy) => cy * cols + cx;
        const inBounds = (cx, cy) => cx >= 0 && cy >= 0 && cx < cols && cy < rows;
        const tx = Math.floor((targetX - ox) / cell);
        const ty = Math.floor((targetY - oy) / cell);
        const obstacles = this.getObstacles();
        const blocked = (cx, cy) => {
            const x = ox + cx * cell + cell / 2;
            const y = oy + cy * cell + cell / 2;
            for (const o of obstacles) {
                if (x >= o.x1 && x <= o.x2 && y >= o.y1 && y <= o.y2) return true;
            }
            return false;
        };
        // Penalty near obstacle shells, with corridor near target door
        const penalty = (cx, cy) => {
            const x = ox + cx * cell + cell / 2;
            const y = oy + cy * cell + cell / 2;
            const doorDist = Math.hypot(x - targetX, y - targetY);
            if (doorDist < 24) return 0;
            let pen = 0;
            for (const o of obstacles) {
                const ex1 = o.x1 - 20, ey1 = o.y1 - 20, ex2 = o.x2 + 20, ey2 = o.y2 + 20;
                const insideShell = x >= ex1 && x <= ex2 && y >= ey1 && y <= ey2;
                const insideCore = x >= o.x1 && x <= o.x2 && y >= o.y1 && y <= o.y2;
                if (insideShell && !insideCore) { pen += 2; break; }
            }
            return pen;
        };
        const q = [];
        if (inBounds(tx, ty)) { dist[idx(tx, ty)] = 0; q.push({ cx: tx, cy: ty }); }
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        while (q.length) {
            const { cx, cy } = q.shift();
            const d0 = dist[idx(cx, cy)];
            for (const [dx, dy] of dirs) {
                const nx = cx + dx, ny = cy + dy;
                if (!inBounds(nx, ny)) continue;
                if (blocked(nx, ny)) continue;
                const i = idx(nx, ny);
                const extra = penalty(nx, ny);
                if (dist[i] > d0 + 1 + extra) { dist[i] = d0 + 1 + extra; q.push({ cx: nx, cy: ny }); }
            }
        }
        const vecX = new Array(cols * rows).fill(0);
        const vecY = new Array(cols * rows).fill(0);
        for (let cy = 0; cy < rows; cy++) {
            for (let cx = 0; cx < cols; cx++) {
                const i = idx(cx, cy);
                if (dist[i] === Infinity) { vecX[i] = 0; vecY[i] = 0; continue; }
                const left = inBounds(cx - 1, cy) ? dist[idx(cx - 1, cy)] : dist[i];
                const right = inBounds(cx + 1, cy) ? dist[idx(cx + 1, cy)] : dist[i];
                const up = inBounds(cx, cy - 1) ? dist[idx(cx, cy - 1)] : dist[i];
                const down = inBounds(cx, cy + 1) ? dist[idx(cx, cy + 1)] : dist[i];
                // FIX: Handle Infinity values to prevent NaN (Infinity - Infinity = NaN)
                let gx = (isFinite(left) && isFinite(right)) ? (left - right) : 0;
                let gy = (isFinite(up) && isFinite(down)) ? (up - down) : 0;
                // Also check for NaN just to be safe
                if (isNaN(gx)) gx = 0;
                if (isNaN(gy)) gy = 0;
                const norm = Math.hypot(gx, gy) || 1;
                vecX[i] = gx / norm;
                vecY[i] = gy / norm;
            }
        }
        return { vecX, vecY, cols, rows, ox, oy, cell, ts: this.gameTime };
    }

    getFlowVector(key, targetX, targetY, x, y) {
        let field = this.flowCache.get(key);
        if (!field || (this.gameTime - field.ts) > 2.0 || field.cols !== Math.ceil(this.canvas.width / this.flowCell) || field.rows !== Math.ceil(this.canvas.height / this.flowCell)) {
            field = this.computeFlowField(targetX, targetY);
            this.flowCache.set(key, field);
        }
        const cx = Math.max(0, Math.min(field.cols - 1, Math.floor((x - field.ox) / field.cell)));
        const cy = Math.max(0, Math.min(field.rows - 1, Math.floor((y - field.oy) / field.cell)));
        const i = cy * field.cols + cx;
        return { x: field.vecX[i], y: field.vecY[i] };
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
            if (ent.constructor.name === 'Worker' || ent.constructor.name === 'CastleGuard') return Utils.dist(x, y, ent.x, ent.y) < (ent.radius || 12) + 10;
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

        // Recompute obstacles occasionally to handle new buildings
        if (this.builder.isBuilding || this.gameTime % 1.0 < dt) {
            this.flowCache.clear();
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

        // NPC Respawns
        if (this.npcRespawns.length > 0) {
            for (let i = this.npcRespawns.length - 1; i >= 0; i--) {
                const r = this.npcRespawns[i];
                r.timer -= dt;
                if (r.timer <= 0) {
                    const c = this.castle;
                    if (r.type === 'Worker') this.entities.push(new Worker(c.x + 30, c.y + 60));
                    else if (r.type === 'CastleGuard') this.entities.push(new CastleGuard(c.x - 40, c.y + 40));
                    this.entities.push(new Particle(c.x, c.y - 50, `${r.type} ready`, 'lime'));
                    this.npcRespawns.splice(i, 1);
                }
            }
        }

        if (this.castle.hp <= 0) { this.endGame(); return; }
        // DEBUG: Reduced spawn rate and added initial delay for testing
        // No monsters spawn in first 30 seconds to allow building/recruiting
        if (this.gameTime > 30 && Math.random() < 0.002) {
            const x = Math.random() < 0.5 ? 0 : this.canvas.width;
            const y = Math.random() * this.canvas.height;

            // Weighted Spawn Pool:
            // 50% Swarm (Goblin)
            // 30% Ranged (Ratman)
            // 15% Tank (Ogre)
            // 5% Siege (Minotaur)
            const roll = Math.random();
            let type = 'SWARM';
            if (roll < 0.5) type = 'SWARM';
            else if (roll < 0.8) type = 'RANGED';
            else if (roll < 0.95) type = 'TANK';
            else type = 'SIEGE';

            this.entities.push(new Monster(x, y, type));
        }
        this.entities.forEach(e => e.update(dt, this));
        this.entities.forEach(e => { if (typeof e.integrate === 'function') e.integrate(dt, this); });
        // Global hard collision resolution pass
        this.resolveCollisions();
        this.entities = this.entities.filter(e => !e.remove);
        this.ui.update(dt);
    }

    resolveCollisions() {
        const units = this.entities.filter(e =>
            !e.remove &&
            (e.constructor.name === 'Hero' ||
                e.constructor.name === 'Monster' ||
                e.constructor.name === 'Worker' ||
                e.constructor.name === 'CastleGuard') &&
            e.visible !== false
        );
        for (let pass = 0; pass < 2; pass++) {
            for (let i = 0; i < units.length; i++) {
                for (let j = i + 1; j < units.length; j++) {
                    const a = units[i], b = units[j];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    let dist = Math.hypot(dx, dy);
                    const minDist = (a.radius || 12) + (b.radius || 12);
                    if (dist === 0) {
                        const jitter = 0.5;
                        a.x -= jitter; a.y -= jitter;
                        b.x += jitter; b.y += jitter;
                        dist = Math.hypot(b.x - a.x, b.y - a.y);
                    }
                    if (dist < minDist && dist > 0) {
                        const overlap = minDist - dist;
                        const nx = dx / dist, ny = dy / dist;
                        // Reduce push force if either unit is engaged to prevent jittering
                        const weakPush = (a.isEngaged || b.isEngaged);
                        const pushAmount = overlap * (weakPush ? 0.15 : 0.35);
                        if (!a.isEngaged) { a.x -= nx * pushAmount; a.y -= ny * pushAmount; }
                        if (!b.isEngaged) { b.x += nx * pushAmount; b.y += ny * pushAmount; }
                    }
                }
            }
        }
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
            if (a instanceof EconomicBuilding || a.constructor.name === 'EconomicBuilding') {
                aBottomY = a.y + a.height / 2 - 10; // Push buildings behind units
            } else if (a.constructor.name === 'Building') {
                aBottomY = a.y + (a.height || 60) / 2 - 10;
            } else if (a instanceof Hero || a.constructor.name === 'Monster') {
                // Units: y is center, feet are at y + radius (or slightly below)
                aBottomY = a.y + (a.radius || 15);
            }

            if (b instanceof EconomicBuilding || b.constructor.name === 'EconomicBuilding') {
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

        if (this.debugMode) {
            const ctx = this.ctx;
            ctx.save();
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            this.entities.forEach(e => {
                if (e.constructor.name === 'Hero') {
                    const vis = e.visible ? 1 : 0;
                    const inB = e.isInsideBuilding ? 1 : 0;
                    const shopT = (e.shopTimer || 0).toFixed(1);
                    const restT = (e.buildingTimeout || 0).toFixed(1);
                    const doorT = (e.doorApproachTimer || 0).toFixed(1);
                    const txt = `${e.state} | vis:${vis} | in:${inB} | t:${shopT}/${restT}/${doorT}`;
                    let dx = e.x, dy = e.y - 50;
                    if (!e.visible) {
                        const b = e.inBuilding;
                        if (b) { dx = b.x; dy = b.y - 60; }
                        else { dx = this.castle.x; dy = this.castle.y - 80; }
                    }
                    ctx.fillStyle = e.visible ? '#0f0' : '#ff5555';
                    ctx.fillText(txt, dx + 6, dy);
                }
            });
            ctx.restore();
        }
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
// DEBUG: Expose game globally for state reading
window.game = game;
