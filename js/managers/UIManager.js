// ... (Keep imports and constructor exactly as before) ...
import { Utils } from '../utils.js';
import { BUILDING_CONFIG } from '../config/BuildingConfig.js';

export class UIManager {
    constructor(game) {
        this.game = game;
        // ... (Same constructor as before) ...
        this.viewEmpty = document.getElementById('view-empty');
        this.viewHero = document.getElementById('view-hero');
        this.viewBuilding = document.getElementById('view-building');
        this.actionGrid = document.getElementById('action-grid');
        this.minimapCanvas = document.getElementById('minimapCanvas');
        this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
        
        this.selectedEntity = null;
        this.lastUpdate = 0;
        this.renderButtons('DEFAULT');
        
        // Setup listeners
        const btnStats = document.getElementById('tab-btn-stats');
        const btnItems = document.getElementById('tab-btn-items'); // New
        const btnMind = document.getElementById('tab-btn-mind');
        const btnClose = document.getElementById('btn-deselect');

        if (btnStats) btnStats.onclick = () => this.switchTab('stats');
        if (btnItems) btnItems.onclick = () => this.switchTab('items'); // New
        if (btnMind) btnMind.onclick = () => this.switchTab('mind');
        if (btnClose) btnClose.onclick = () => this.deselect();
    }

    // ... (Keep update, select, deselect, switchTab, renderButtons, updateHeroData) ...
    update(dt) {
        this.lastUpdate += dt;
        const goldEl = document.getElementById('gold-display');
        if(goldEl) goldEl.innerText = Math.floor(this.game.gold);

        if (this.selectedEntity) {
            if (this.selectedEntity.remove) {
                this.deselect();
            } else {
                if (this.selectedEntity.constructor.name === 'Hero') this.updateHeroData();
                if (this.selectedEntity.constructor.name === 'EconomicBuilding') this.updateBuildingData();
            }
        }

        if (this.lastUpdate > 0.1 && this.minimapCtx) {
            this.drawMinimap();
            this.lastUpdate = 0;
        }
    }

    select(entity) {
        this.selectedEntity = entity;
        
        if(this.viewEmpty) this.viewEmpty.classList.add('hidden');
        if(this.viewHero) this.viewHero.classList.add('hidden');
        if(this.viewBuilding) this.viewBuilding.classList.add('hidden');

        if (entity.constructor.name === 'Hero') {
            if(this.viewHero) this.viewHero.classList.remove('hidden');
            // Ensure a tab is active
            if (document.getElementById('content-stats').classList.contains('hidden') && 
                document.getElementById('content-items').classList.contains('hidden') &&
                document.getElementById('content-mind').classList.contains('hidden')) {
                this.switchTab('stats');
            }
            this.renderButtons('HERO'); 
            this.updateHeroData();
        } 
        else if (entity.constructor.name === 'EconomicBuilding') {
            if(this.viewBuilding) this.viewBuilding.classList.remove('hidden');
            
            document.getElementById('bld-name').innerText = entity.name || "Building";
            document.getElementById('bld-type').innerText = entity.type || "Structure";
            document.getElementById('bld-portrait').style.backgroundColor = entity.color || "#777";
            
            let desc = "A structure.";
            if (BUILDING_CONFIG[entity.type]) desc = BUILDING_CONFIG[entity.type].description;
            document.getElementById('bld-desc').innerText = desc;

            if (entity.type === 'GUILD') this.renderButtons('GUILD');
            else if (entity.type === 'MARKET') this.renderButtons('MARKET');
            else this.renderButtons('BUILDING');
        }
    }

    deselect() {
        this.selectedEntity = null;
        if(this.viewEmpty) this.viewEmpty.classList.remove('hidden');
        if(this.viewHero) this.viewHero.classList.add('hidden');
        if(this.viewBuilding) this.viewBuilding.classList.add('hidden');
        this.renderButtons('DEFAULT');
    }

    switchTab(tabName) {
        // Helper to toggle
        const setTab = (name, active) => {
            const btn = document.getElementById(`tab-btn-${name}`);
            const content = document.getElementById(`content-${name}`);
            if(btn) active ? btn.classList.add('active') : btn.classList.remove('active');
            if(content) active ? content.classList.remove('hidden') : content.classList.add('hidden');
        };

        setTab('stats', tabName === 'stats');
        setTab('items', tabName === 'items');
        setTab('mind', tabName === 'mind');
        
        if (this.selectedEntity) this.updateHeroData();
    }

    renderButtons(context) {
        if(!this.actionGrid) return;
        this.actionGrid.innerHTML = ''; 
        const addBtn = (icon, label, cost, onClick) => {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.innerHTML = `<div class="icon">${icon}</div><div class="label">${label}</div><div class="cost">${cost}</div>`;
            btn.onclick = onClick;
            this.actionGrid.appendChild(btn);
        };

        if (context === 'DEFAULT' || context === 'MARKET' || context === 'BUILDING') {
            addBtn('🚩', 'Bounty', '100g', () => this.game.toggleFlagMode());
            addBtn('🏛️', 'Guild', '300g', () => this.game.builder.startBuild('GUILD'));
            addBtn('⚖️', 'Market', '200g', () => this.game.builder.startBuild('MARKET'));
            addBtn('🗼', 'Tower', '150g', () => this.game.builder.startBuild('TOWER'));
        }
        else if (context === 'GUILD') {
            addBtn('⚔️', 'Warrior', '200g', () => this.game.recruit('WARRIOR')); 
            addBtn('🏹', 'Ranger', '250g', () => this.game.recruit('RANGER'));
            addBtn('🔙', 'Back', '', () => this.deselect());
        }
        else if (context === 'HERO') {
            addBtn('🚩', 'Bounty', '100g', () => this.game.toggleFlagMode());
            addBtn('🔙', 'Deselect', '', () => this.deselect());
        }
    }

    updateHeroData() {
        const h = this.selectedEntity;
        if(!h) return;

        // ... (Basic data updates same as before) ...
        document.getElementById('insp-name').innerText = h.name;
        document.getElementById('insp-lvl').innerText = `Level ${h.level} ${h.type}`;
        document.getElementById('insp-hp-text').innerText = `${Math.floor(h.hp)}/${Math.floor(h.maxHp)}`;
        document.getElementById('insp-state').innerText = h.state;
        document.getElementById('insp-hp-bar').style.width = (h.hp/h.maxHp)*100 + '%';
        document.getElementById('insp-portrait').style.backgroundColor = h.color;

        const stats = h.stats.current;
        const attrEl = document.getElementById('insp-attributes');
        if(attrEl) attrEl.innerHTML = `
            <div class="stat-item"><span>STR</span> <span class="stat-val">${Math.floor(stats.STR)}</span></div>
            <div class="stat-item"><span>AGI</span> <span class="stat-val">${Math.floor(stats.AGI)}</span></div>
            <div class="stat-item"><span>VIT</span> <span class="stat-val">${Math.floor(stats.VIT)}</span></div>
            <div class="stat-item"><span>INT</span> <span class="stat-val">${Math.floor(stats.INT)}</span></div>
            <div class="stat-item"><span>WIL</span> <span class="stat-val">${Math.floor(stats.WIL)}</span></div>
            <div class="stat-item"><span>LUK</span> <span class="stat-val">${Math.floor(stats.LUK)}</span></div>
        `;

        // ITEMS TAB - Always update inventory when hero data is refreshed
        const invEl = document.getElementById('insp-inventory');
        if(invEl) {
            invEl.innerHTML = '';
            for(let i=0; i<h.inventory.capacity; i++) {
                const item = h.inventory.items[i];
                const slot = document.createElement('div');
                slot.className = item ? 'inv-slot filled' : 'inv-slot';
                slot.innerText = item ? item.name[0] : '';
                slot.title = item ? item.name : 'Empty';
                invEl.appendChild(slot);
            }
        }
        
        // MIND TAB
        const persEl = document.getElementById('insp-personality');
        if(persEl) persEl.innerHTML = `
            <div class="stat-item"><span>Brave</span> <span class="stat-val">${h.personality.brave.toFixed(2)}</span></div>
            <div class="stat-item"><span>Greedy</span> <span class="stat-val">${h.personality.greedy.toFixed(2)}</span></div>
            <div class="stat-item"><span>Smart</span> <span class="stat-val">${h.personality.smart.toFixed(2)}</span></div>
        `;
        
        // HISTORY SECTION
        const historyEl = document.getElementById('insp-history');
        if(historyEl && h.history) {
            historyEl.innerHTML = `
                <div style="font-size:10px; color:#888; margin-top:5px; border-top:1px solid #333; padding-top:5px;">
                    <div>Kills: <span style="color:var(--gold);">${h.history.kills || 0}</span></div>
                    <div>Gold Earned: <span style="color:var(--gold);">${h.history.goldEarned || 0}g</span></div>
                    <div>Near Death: <span style="color:#ff5555;">${h.history.nearDeath || 0}</span></div>
                    <div>Times Wounded: <span style="color:#ffaa55;">${h.history.timesWounded || 0}</span></div>
                </div>
            `;
        }
    }

    updateBuildingData() {
        const b = this.selectedEntity;
        if(!b) return;

        document.getElementById('bld-hp-text').innerText = `${Math.floor(b.hp)}/${Math.floor(b.maxHp)}`;
        document.getElementById('bld-hp-bar').style.width = (b.hp/b.maxHp)*100 + '%';
        
        let extraInfo = "";
        if (b.type === 'MARKET') extraInfo = `Trade Volume: ${b.heroesNearby || 0} heroes`;
        document.getElementById('bld-stats').innerHTML = extraInfo;

        // VISITOR LIST
        const vList = document.getElementById('bld-visitor-list');
        // !!! FIX: Remove innerHTML wipe to allow events, but since we rebuild every frame for updates, 
        // we need a cleaner way. For now, simple rebuild is fine for prototype.
        
        // We only rebuild if the count changed or just strictly rebuild (easier)
        // To make clicks work reliably, ensure the element exists.
        // Check if element exists in index.html
        if(!vList && document.getElementById('bld-visitors-container')) {
             // Create it if missing? No, rely on HTML.
             return;
        }
        
        if(vList) {
            vList.innerHTML = ''; 
            if (b.visitors && b.visitors.length > 0) {
                b.visitors.forEach(hero => {
                    const row = document.createElement('div');
                    row.className = 'visitor-row';
                    row.innerHTML = `<span>${hero.name}</span> <span style="font-size:9px; color:#888;">(${Math.floor(hero.hp)}hp)</span>`;
                    
                    // CLICK HANDLER
                    row.onclick = (e) => {
                        e.stopPropagation(); // Don't click through to something else
                        this.select(hero); // Select the visitor
                    };
                    
                    vList.appendChild(row);
                });
            } else {
                vList.innerHTML = `<div style="padding:5px; color:#555; font-style:italic;">No visitors.</div>`;
            }
        }
    }

    drawMinimap() { /* ... same ... */ 
        const ctx = this.minimapCtx;
        if(!ctx) return;
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
        const scaleX = w / this.game.canvas.width;
        const scaleY = h / this.game.canvas.height;

        this.game.entities.forEach(e => {
            const mx = e.x * scaleX;
            const my = e.y * scaleY;
            if (e.constructor.name === 'Hero') { ctx.fillStyle = e.color; ctx.fillRect(mx-1, my-1, 3, 3); }
            else if (e.constructor.name === 'Monster') { ctx.fillStyle = 'red'; ctx.fillRect(mx-1, my-1, 2, 2); }
            else if (e.constructor.name === 'EconomicBuilding') { 
                ctx.fillStyle = e.color || '#888'; ctx.fillRect(mx-2, my-2, 5, 5); 
                if (e === this.selectedEntity) { ctx.strokeStyle = 'white'; ctx.strokeRect(mx-3, my-3, 7, 7); }
            }
        });
        ctx.strokeStyle = '#333'; ctx.strokeRect(0, 0, w, h);
    }
}