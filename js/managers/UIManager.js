// ... (Keep imports and constructor exactly as before) ...
import { Utils } from '../utils.js';
import { BUILDING_CONFIG } from '../config/BuildingConfig.js';
import { EconomicBuilding } from '../entities/EconomicBuilding.js';

export class UIManager {
    constructor(game) {
        this.game = game;
        // ... (Same constructor as before) ...
        this.viewEmpty = document.getElementById('view-empty');
        this.viewHero = document.getElementById('view-hero');
        this.viewBuilding = document.getElementById('view-building');
        this.viewMonster = document.getElementById('view-monster'); // New: Monster View
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
        const rqPanel = document.getElementById('bld-recruit');
        if (rqPanel) {
            rqPanel.addEventListener('click', (e) => {
                const warriorBtn = e.target.closest('#bld-btn-warrior');
                const rangerBtn = e.target.closest('#bld-btn-ranger');
                if (!warriorBtn && !rangerBtn) return;
                const b = this.selectedEntity;
                if (!b || !(b instanceof EconomicBuilding) || b.type !== 'GUILD') return;

                // FIX: Prevent recruiting if not constructed
                if (!b.constructed) {
                    this.game.entities.push(new (this.game.entities[0].constructor)(b.x, b.y - 40, "Building not ready!", "red"));
                    return;
                }

                if (warriorBtn) this.game.recruit('WARRIOR', b);
                else if (rangerBtn) this.game.recruit('RANGER', b);
            });
        }
        const vList = document.getElementById('bld-visitor-list');
        if (vList) {
            vList.addEventListener('click', (e) => {
                const row = e.target.closest('.visitor-row');
                if (!row) return;
                const idx = Array.prototype.indexOf.call(vList.children, row);
                const currB = this.selectedEntity;
                // Support any entity with visitors array (EconomicBuilding, Castle, Guild, etc.)
                if (!currB || !currB.visitors) return;
                if (currB.visitors[idx]) {
                    e.stopPropagation();
                    this.select(currB.visitors[idx]);
                }
            });
        }
    }

    // ... (Keep update, select, deselect, switchTab, renderButtons, updateHeroData) ...
    update(dt) {
        this.lastUpdate += dt;
        const goldEl = document.getElementById('gold-display');
        if (goldEl) goldEl.innerText = Math.floor(this.game.gold);

        // WAVE DISPLAY
        const waveEl = document.getElementById('wave-display');
        if (waveEl) {
            const state = this.game.waveState;
            const wave = this.game.currentWave;
            const timer = Math.ceil(this.game.waveTimer);

            if (state === 'BUILD') {
                if (wave === 0) {
                    waveEl.innerText = `Prepare! Wave 1 in ${timer}s`;
                } else {
                    waveEl.innerText = `Build Phase - Wave ${wave + 1} in ${timer}s`;
                }
            } else if (state === 'COMBAT') {
                const remaining = this.game.entities.filter(e =>
                    e.constructor.name === 'Monster' && !e.remove && e.hp > 0
                ).length + this.game.waveSpawnQueue.length;
                waveEl.innerText = `Wave ${wave} - ${remaining} enemies`;
            } else if (state === 'VICTORY') {
                waveEl.innerText = '🏆 VICTORY!';
            } else if (state === 'DEFEAT') {
                waveEl.innerText = '💀 DEFEAT';
            }
        }

        if (this.selectedEntity) {
            if (this.selectedEntity.remove) {
                this.deselect();
            } else {
                if (this.selectedEntity.constructor.name === 'Hero') this.updateHeroData();
                if (this.selectedEntity instanceof EconomicBuilding || this.selectedEntity.constructor.name === 'EconomicBuilding') this.updateBuildingData();
                if (this.selectedEntity.constructor.name === 'Monster') this.updateMonsterData();
                if (this.selectedEntity.constructor.name === 'TaxCollector') this.updateTaxCollectorData(this.selectedEntity);
            }
        }

        if (this.lastUpdate > 0.1 && this.minimapCtx) {
            this.drawMinimap();
            this.lastUpdate = 0;
        }
    }

    select(entity) {
        this.selectedEntity = entity;

        if (this.viewEmpty) this.viewEmpty.classList.add('hidden');
        if (this.viewHero) this.viewHero.classList.add('hidden');
        if (this.viewBuilding) this.viewBuilding.classList.add('hidden');
        if (this.viewMonster) this.viewMonster.classList.add('hidden'); // Added: Hide Monster view

        if (entity.constructor.name === 'Hero') {
            if (this.viewHero) this.viewHero.classList.remove('hidden');
            // Ensure a tab is active
            if (document.getElementById('content-stats').classList.contains('hidden') &&
                document.getElementById('content-items').classList.contains('hidden') &&
                document.getElementById('content-mind').classList.contains('hidden')) {
                this.switchTab('stats');
            }
            this.renderButtons('HERO');
            this.updateHeroData();
        }
        else if (entity.constructor.name === 'Monster') {
            if (this.viewMonster) this.viewMonster.classList.remove('hidden');
            this.renderButtons('MONSTER');
            this.updateMonsterData();
        }
        else if (entity instanceof EconomicBuilding || entity.constructor.name === 'EconomicBuilding') {
            if (this.viewBuilding) this.viewBuilding.classList.remove('hidden');

            document.getElementById('bld-name').innerText = entity.name || "Building";
            document.getElementById('bld-type').innerText = entity.type || "Structure";
            document.getElementById('bld-portrait').style.backgroundColor = entity.color || "#777";

            let desc = "A structure.";
            if (BUILDING_CONFIG[entity.type]) desc = BUILDING_CONFIG[entity.type].description;
            document.getElementById('bld-desc').innerText = desc;

            if (entity.type === 'GUILD') this.renderButtons('GUILD');
            else if (entity.type === 'MARKET') this.renderButtons('MARKET');
            else this.renderButtons('BUILDING');
            // Recruitment panel only for GUILD
            const rqPanel = document.getElementById('bld-recruit');
            if (rqPanel) rqPanel.style.display = entity.type === 'GUILD' ? 'block' : 'none';
            const vList = document.getElementById('bld-visitor-list');
            if (vList) {
                vList.dataset.buildingId = entity.id || entity.name || 'building';
                vList.dataset.lastFingerprint = ''; // Reset fingerprint on entity change
                vList.replaceChildren();
            }
            this.updateBuildingData();
        }
        else if (entity.constructor.name === 'Worker' || entity.constructor.name === 'CastleGuard') {
            if (this.viewMonster) this.viewMonster.classList.remove('hidden');
            this.renderButtons('HERO');
            this.updateNPCData(entity);
        }
        else if (entity.constructor.name === 'TaxCollector') {
            if (this.viewMonster) this.viewMonster.classList.remove('hidden');
            this.renderButtons('DEFAULT');
            this.updateTaxCollectorData(entity);
        }
    }

    deselect() {
        this.selectedEntity = null;
        if (this.viewEmpty) this.viewEmpty.classList.remove('hidden');
        if (this.viewHero) this.viewHero.classList.add('hidden');
        if (this.viewBuilding) this.viewBuilding.classList.add('hidden');
        if (this.viewMonster) this.viewMonster.classList.add('hidden');
        this.renderButtons('DEFAULT');
    }

    switchTab(tabName) {
        // Helper to toggle
        const setTab = (name, active) => {
            const btn = document.getElementById(`tab-btn-${name}`);
            const content = document.getElementById(`content-${name}`);
            if (btn) active ? btn.classList.add('active') : btn.classList.remove('active');
            if (content) active ? content.classList.remove('hidden') : content.classList.add('hidden');
        };

        setTab('stats', tabName === 'stats');
        setTab('items', tabName === 'items');
        setTab('mind', tabName === 'mind');

        if (this.selectedEntity) this.updateHeroData();
    }

    renderButtons(context) {
        if (!this.actionGrid) return;
        this.actionGrid.innerHTML = '';
        const addBtn = (icon, label, cost, onClick) => {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.innerHTML = `<div class="icon">${icon}</div><div class="label">${label}</div><div class="cost">${cost}</div>`;
            btn.onclick = onClick;
            this.actionGrid.appendChild(btn);
        };

        if (context === 'DEFAULT' || context === 'MARKET' || context === 'BUILDING' || context === 'BLACKSMITH') {
            addBtn('🚩', 'Bounty', '100g', () => this.game.toggleFlagMode());
            addBtn('🏛️', 'Warrior Guild', '300g', () => this.game.builder.startBuild('WARRIOR_GUILD'));
            addBtn('🏹', 'Ranger Guild', '300g', () => this.game.builder.startBuild('RANGER_GUILD'));
            addBtn('⚖️', 'Market', '200g', () => this.game.builder.startBuild('MARKET'));
            addBtn('🗼', 'Tower', '150g', () => this.game.builder.startBuild('TOWER'));
            addBtn('🔨', 'Blacksmith', '350g', () => this.game.builder.startBuild('BLACKSMITH'));
        }
        else if (context === 'GUILD') {
            addBtn('🔙', 'Back', '', () => this.deselect());
        }
        else if (context === 'HERO') {
            addBtn('🚩', 'Bounty', '100g', () => this.game.toggleFlagMode());
            addBtn('🔙', 'Deselect', '', () => this.deselect());
        }
        else if (context === 'MONSTER') {
            addBtn('🚩', 'Bounty', '100g', () => this.game.toggleFlagMode());
            addBtn('🔙', 'Deselect', '', () => this.deselect());
        }
    }

    updateHeroData() {
        const h = this.selectedEntity;
        if (!h) return;

        // ... (Basic data updates same as before) ...
        document.getElementById('insp-name').innerText = h.name;
        document.getElementById('insp-lvl').innerText = `Level ${h.level} ${h.type}`;
        document.getElementById('insp-hp-text').innerText = `${Math.floor(h.hp)}/${Math.floor(h.maxHp)}`;
        document.getElementById('insp-state').innerText = h.state;
        document.getElementById('insp-hp-bar').style.width = (h.hp / h.maxHp) * 100 + '%';
        document.getElementById('insp-portrait').style.backgroundColor = h.color;

        const stats = h.stats.current;
        const attrEl = document.getElementById('insp-attributes');
        if (attrEl) attrEl.innerHTML = `
            <div class="stat-item"><span>STR</span> <span class="stat-val">${Math.floor(stats.STR)}</span></div>
            <div class="stat-item"><span>AGI</span> <span class="stat-val">${Math.floor(stats.AGI)}</span></div>
            <div class="stat-item"><span>VIT</span> <span class="stat-val">${Math.floor(stats.VIT)}</span></div>
            <div class="stat-item"><span>INT</span> <span class="stat-val">${Math.floor(stats.INT)}</span></div>
            <div class="stat-item"><span>WIL</span> <span class="stat-val">${Math.floor(stats.WIL)}</span></div>
            <div class="stat-item"><span>LUK</span> <span class="stat-val">${Math.floor(stats.LUK)}</span></div>
        `;

        // ITEMS TAB - Display Equipment and Belt
        const invEl = document.getElementById('insp-inventory');
        if (invEl) {
            invEl.innerHTML = '';

            // EQUIPMENT SECTION
            const equipLabel = document.createElement('div');
            equipLabel.style.cssText = 'font-size:10px; color:#888; margin-bottom:4px; border-bottom:1px solid #444; padding-bottom:4px;';
            equipLabel.innerText = 'EQUIPMENT';
            invEl.appendChild(equipLabel);

            // Weapon Slot
            const weaponSlot = document.createElement('div');
            weaponSlot.className = 'inv-slot filled';
            weaponSlot.style.cssText = 'display:inline-flex; flex-direction:column; align-items:center; margin-right:8px; padding:4px; background:#222; border:1px solid #444; border-radius:4px; min-width:60px;';
            const weapon = h.equipment?.weapon;
            weaponSlot.innerHTML = `
                <span style="font-size:16px;">⚔️</span>
                <span style="font-size:8px; color:#ffd700;">${weapon?.name || 'None'}</span>
                <span style="font-size:7px; color:#888;">+${weapon?.damage || 0} DMG</span>
            `;
            weaponSlot.title = weapon ? `${weapon.name}\n${weapon.description}` : 'No weapon';
            invEl.appendChild(weaponSlot);

            // Armor Slot
            const armorSlot = document.createElement('div');
            armorSlot.className = 'inv-slot filled';
            armorSlot.style.cssText = 'display:inline-flex; flex-direction:column; align-items:center; padding:4px; background:#222; border:1px solid #444; border-radius:4px; min-width:60px;';
            const armor = h.equipment?.armor;
            armorSlot.innerHTML = `
                <span style="font-size:16px;">🛡️</span>
                <span style="font-size:8px; color:#87ceeb;">${armor?.name || 'None'}</span>
                <span style="font-size:7px; color:#888;">+${armor?.defense || 0} DEF</span>
            `;
            armorSlot.title = armor ? `${armor.name}\n${armor.description}` : 'No armor';
            invEl.appendChild(armorSlot);

            // Add Belt label
            const beltLabel = document.createElement('div');
            beltLabel.style.cssText = 'font-size:10px; color:#888; margin-bottom:4px; margin-top:8px; border-bottom:1px solid #444; padding-bottom:4px;';
            beltLabel.innerText = 'BELT (Potions)';
            invEl.appendChild(beltLabel);

            // Potion Slot 1
            const slot1 = document.createElement('div');
            slot1.className = h.inventory.belt.potion1 ? 'inv-slot filled' : 'inv-slot';
            slot1.innerText = h.inventory.belt.potion1 ? '🧪' : '';
            slot1.title = h.inventory.belt.potion1 ? h.inventory.belt.potion1.name : 'Empty';
            invEl.appendChild(slot1);

            // Potion Slot 2
            const slot2 = document.createElement('div');
            slot2.className = h.inventory.belt.potion2 ? 'inv-slot filled' : 'inv-slot';
            slot2.innerText = h.inventory.belt.potion2 ? '🧪' : '';
            slot2.title = h.inventory.belt.potion2 ? h.inventory.belt.potion2.name : 'Empty';
            invEl.appendChild(slot2);
        }

        // GOLD in Items tab
        const goldEl = document.getElementById('insp-gold');
        if (goldEl) goldEl.innerText = `${Math.floor(h.gold)}g`;

        // STAMINA & XP bars
        const stamBar = document.getElementById('insp-stamina-bar');
        const stamText = document.getElementById('insp-stamina-text');
        if (stamBar) stamBar.style.width = (h.stamina / h.maxStamina) * 100 + '%';
        if (stamText) stamText.innerText = `${Math.floor(h.stamina)}/${Math.floor(h.maxStamina)}`;

        const xpPct = Math.min(100, Math.floor((h.xp / h.xpToNextLevel) * 100));
        const xpBar = document.getElementById('insp-xp-bar');
        const xpText = document.getElementById('insp-xp-text');
        if (xpBar) xpBar.style.width = xpPct + '%';
        if (xpText) xpText.innerText = `${xpPct}% to next level`;

        // MIND TAB
        const persEl = document.getElementById('insp-personality');
        if (persEl) persEl.innerHTML = `
            <div class="stat-item"><span>Brave</span> <span class="stat-val">${h.personality.brave.toFixed(2)}</span></div>
            <div class="stat-item"><span>Greedy</span> <span class="stat-val">${h.personality.greedy.toFixed(2)}</span></div>
            <div class="stat-item"><span>Smart</span> <span class="stat-val">${h.personality.smart.toFixed(2)}</span></div>
        `;

        // HISTORY SECTION
        const historyEl = document.getElementById('insp-history');
        if (historyEl && h.history) {
            historyEl.innerHTML = `
                <div style="font-size:10px; color:#888; margin-top:5px; border-top:1px solid #333; padding-top:5px;">
                    <div>Kills: <span style="color:var(--gold);">${h.history.kills || 0}</span></div>
                    <div>Gold Earned: <span style="color:var(--gold);">${h.history.goldEarned || 0}g</span></div>
                    <div>Near Death: <span style="color:#ff5555;">${h.history.nearDeath || 0}</span></div>
                    <div>Times Wounded: <span style="color:#ffaa55;">${h.history.timesWounded || 0}</span></div>
                </div>
            `;
        }

        const skillEl = document.getElementById('insp-skills');
        if (skillEl) {
            skillEl.innerHTML = '';
            const title = document.createElement('div');
            title.style.cssText = 'font-size:10px; color:#888; border-bottom:1px solid #444; margin-bottom:4px;';
            title.innerText = 'SKILLS';
            skillEl.appendChild(title);

            if (h.skills && h.skills.length > 0) {
                h.skills.forEach(s => {
                    const row = document.createElement('div');
                    const cd = Math.max(0, (s.lastUsed || -1) + s.cooldown - this.game.gameTime);
                    const status = cd > 0 ? `${cd.toFixed(1)}s` : 'Ready';
                    row.className = 'visitor-row';
                    row.title = s.description || '';
                    row.innerHTML = `<span>${s.name}</span> <span style="font-size:9px; color:#8fd3ff;">${status}</span>`;
                    skillEl.appendChild(row);
                });
            } else {
                const none = document.createElement('div');
                none.style.cssText = 'padding:5px; color:#555; font-style:italic;';
                none.innerText = 'No skills learned.';
                skillEl.appendChild(none);
            }
        }
    }

    updateMonsterData() {
        const m = this.selectedEntity;
        if (!m) return;

        const nameEl = document.getElementById('mon-name');
        if (nameEl) nameEl.innerText = m.name || m.archetype || "Monster";
        const typeEl = document.getElementById('mon-type');
        if (typeEl) typeEl.innerText = 'Enemy';

        const hpText = document.getElementById('mon-hp-text');
        if (hpText) hpText.innerText = `${Math.floor(m.hp)}/${Math.floor(m.maxHp)}`;

        const hpBar = document.getElementById('mon-hp-bar');
        if (hpBar) hpBar.style.width = (m.hp / m.maxHp) * 100 + '%';

        const portrait = document.getElementById('mon-portrait');
        if (portrait) portrait.style.backgroundColor = m.color;

        const statsEl = document.getElementById('mon-stats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-item"><span>DMG</span> <span class="stat-val">${m.damage}</span></div>
                <div class="stat-item"><span>Dodge</span> <span class="stat-val">${(m.dodgeChance * 100).toFixed(0)}%</span></div>
                <div class="stat-item"><span>Parry</span> <span class="stat-val">${(m.parryChance * 100).toFixed(0)}%</span></div>
                <div class="stat-item"><span>Resist</span> <span class="stat-val">${(m.resistPct * 100).toFixed(0)}%</span></div>
            `;
        }
    }

    updateNPCData(npc) {
        const nameEl = document.getElementById('mon-name');
        if (nameEl) nameEl.innerText = npc.name || (npc.constructor.name === 'Worker' ? 'Worker' : 'Castle Guard');
        const typeEl = document.getElementById('mon-type');
        if (typeEl) typeEl.innerText = npc.constructor.name === 'Worker' ? 'Civilian' : 'Guard';
        const hpText = document.getElementById('mon-hp-text');
        if (hpText) hpText.innerText = `${Math.floor(npc.hp)}/${Math.floor(npc.maxHp)}`;
        const hpBar = document.getElementById('mon-hp-bar');
        if (hpBar) { hpBar.style.width = (npc.hp / npc.maxHp) * 100 + '%'; hpBar.style.background = '#2ecc71'; }
        const portrait = document.getElementById('mon-portrait');
        if (portrait) portrait.style.backgroundColor = npc.color;
        const statsEl = document.getElementById('mon-stats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-item"><span>Speed</span> <span class="stat-val">${Math.floor(npc.speed || 50)}</span></div>
                <div class="stat-item"><span>DMG</span> <span class="stat-val">${Math.floor(npc.damage || 0)}</span></div>
                <div class="stat-item"><span>Dodge</span> <span class="stat-val">${((npc.dodgeChance || 0) * 100).toFixed(0)}%</span></div>
                <div class="stat-item"><span>Parry</span> <span class="stat-val">${((npc.parryChance || 0) * 100).toFixed(0)}%</span></div>
                <div class="stat-item"><span>Resist</span> <span class="stat-val">${((npc.resistPct || 0) * 100).toFixed(0)}%</span></div>
            `;
        }
    }

    updateTaxCollectorData(tc) {
        const nameEl = document.getElementById('mon-name');
        if (nameEl) nameEl.innerText = tc.name || 'Tax Collector';
        const typeEl = document.getElementById('mon-type');
        if (typeEl) typeEl.innerText = 'NPC';
        const hpText = document.getElementById('mon-hp-text');
        if (hpText) hpText.innerText = `${Math.floor(tc.hp)}/${Math.floor(tc.maxHp)}`;
        const hpBar = document.getElementById('mon-hp-bar');
        if (hpBar) { hpBar.style.width = (tc.hp / tc.maxHp) * 100 + '%'; hpBar.style.background = '#ffd700'; }
        const portrait = document.getElementById('mon-portrait');
        if (portrait) portrait.style.backgroundColor = tc.color;
        const statsEl = document.getElementById('mon-stats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-item"><span>Carrying</span> <span class="stat-val">${Math.floor(tc.carriedGold)}g</span></div>
                <div class="stat-item"><span>State</span> <span class="stat-val" style="font-size:9px;">${tc.state}</span></div>
                <div style="margin-top:8px; font-size:10px; color:#888;">SETTINGS</div>
                <div class="stat-item" style="margin-top:4px;">
                    <span>Min Pickup</span>
                    <input type="number" id="tc-collect-threshold" value="${tc.collectThreshold}" 
                        style="width:45px; background:#222; border:1px solid #555; color:white; text-align:right; padding:2px;" />
                </div>
                <div class="stat-item">
                    <span>Max Carry</span>
                    <input type="number" id="tc-max-carry" value="${tc.maxCarry}" 
                        style="width:45px; background:#222; border:1px solid #555; color:white; text-align:right; padding:2px;" />
                </div>
            `;
            // Attach input listeners
            const collectInput = document.getElementById('tc-collect-threshold');
            const carryInput = document.getElementById('tc-max-carry');
            if (collectInput) collectInput.onchange = (e) => { tc.collectThreshold = parseInt(e.target.value) || 20; };
            if (carryInput) carryInput.onchange = (e) => { tc.maxCarry = parseInt(e.target.value) || 100; };
        }
    }

    updateBuildingData() {
        const b = this.selectedEntity;
        if (!b) return;

        document.getElementById('bld-hp-text').innerText = `${Math.floor(b.hp)}/${Math.floor(b.maxHp)}`;
        document.getElementById('bld-hp-bar').style.width = (b.hp / b.maxHp) * 100 + '%';

        let extraInfo = "";
        const pct = Math.floor((b.hp / b.maxHp) * 100);
        if (!b.constructed) extraInfo = `Constructing: ${pct}%`;
        else if (b.hp < b.maxHp) extraInfo = `Repairing: ${pct}%`;
        else if (b.type === 'MARKET') extraInfo = `Trade Volume: ${b.heroesNearby || 0} heroes`;

        if (b.type === 'GUILD') {
            const rqPanel = document.getElementById('bld-recruit');
            if (rqPanel) {
                if (b.constructed) {
                    rqPanel.style.opacity = '1.0';
                    rqPanel.style.pointerEvents = 'auto';
                } else {
                    rqPanel.style.opacity = '0.5';
                    rqPanel.style.pointerEvents = 'none';
                }
            }
        }

        // ECONOMY: Show treasury
        if (b.treasury !== undefined && b.treasury > 0) {
            extraInfo += `<div style="color:gold; margin-top:5px;">Treasury: ${Math.floor(b.treasury)}/${b.maxTreasury}g</div>`;
        }
        document.getElementById('bld-stats').innerHTML = extraInfo;

        // VISITOR LIST
        const vList = document.getElementById('bld-visitor-list');
        if (!vList && document.getElementById('bld-visitors-container')) return;

        if (vList) {
            const key = b.id || b.name || 'building';
            vList.dataset.buildingId = key;

            // Create a fingerprint to detect changes
            const visitorFingerprint = b.visitors ? b.visitors.map(h => `${h.name}:${Math.floor(h.hp)}`).join(',') : '';

            // Only re-render if visitors changed
            if (vList.dataset.lastFingerprint !== visitorFingerprint) {
                vList.dataset.lastFingerprint = visitorFingerprint;

                if (b.visitors && b.visitors.length > 0) {
                    const frag = document.createDocumentFragment();
                    b.visitors.forEach((hero, idx) => {
                        const row = document.createElement('div');
                        row.className = 'visitor-row';
                        row.style.display = 'flex';
                        row.style.alignItems = 'center';
                        row.style.justifyContent = 'space-between';
                        row.style.padding = '4px 8px';
                        row.style.borderBottom = '1px solid #333';

                        const info = document.createElement('span');
                        info.innerHTML = `${hero.name} <span style="font-size:9px; color:#888;">(${Math.floor(hero.hp)}hp)</span>`;

                        const btn = document.createElement('button');
                        btn.innerHTML = '🔍';
                        btn.title = 'Inspect';
                        btn.style.cssText = 'background:#444; border:1px solid #666; color:white; padding:2px 6px; cursor:pointer; border-radius:3px; font-size:10px;';
                        btn.onmouseenter = () => { btn.style.background = '#666'; };
                        btn.onmouseleave = () => { btn.style.background = '#444'; };
                        btn.onclick = (e) => {
                            e.stopPropagation();
                            this.select(hero);
                        };

                        row.appendChild(info);
                        row.appendChild(btn);
                        frag.appendChild(row);
                    });
                    vList.replaceChildren(frag);
                } else {
                    vList.replaceChildren();
                    const empty = document.createElement('div');
                    empty.style.padding = '5px';
                    empty.style.color = '#555';
                    empty.style.fontStyle = 'italic';
                    empty.textContent = 'No visitors.';
                    vList.appendChild(empty);
                }
            }
        }

        // Recruitment Panel
        const rqText = document.getElementById('bld-recruit-text');
        const rqBar = document.getElementById('bld-recruit-bar');
        const isGuild = b.type === 'GUILD';
        const btnWarrior = document.getElementById('bld-btn-warrior');
        const btnRanger = document.getElementById('bld-btn-ranger');
        const allowW = isGuild && (!b.allowedRecruits || b.allowedRecruits.includes('WARRIOR'));
        const allowR = isGuild && (!b.allowedRecruits || b.allowedRecruits.includes('RANGER'));
        if (btnWarrior) {
            btnWarrior.disabled = !isGuild || !allowW || this.game.gold < 200;
            btnWarrior.style.opacity = btnWarrior.disabled ? '0.6' : '1';
            btnWarrior.style.display = isGuild ? 'inline-block' : 'none';
        }
        if (btnRanger) {
            btnRanger.disabled = !isGuild || !allowR || this.game.gold < 350;
            btnRanger.style.opacity = btnRanger.disabled ? '0.6' : '1';
            btnRanger.style.display = isGuild ? 'inline-block' : 'none';
        }

        if (isGuild) {
            const current = this.game.recruitQueue[0];
            const isCurrentHere = current && current.source && ((current.source === b) || (current.source.id && current.source.id === b.id));
            if (isCurrentHere) {
                const total = current.type === 'RANGER' ? 3.0 : 2.0;
                const pct = Math.max(0, Math.min(1, 1 - (current.timer / total)));
                if (rqBar) rqBar.style.width = (pct * 100) + '%';
                if (rqText) rqText.innerText = `Training ${current.type} — ${Math.max(0, current.timer).toFixed(1)}s`;
            } else {
                const positions = this.game.recruitQueue
                    .map((item, i) => (item.source && ((item.source === b) || (item.source.id && item.source.id === b.id))) ? (i + 1) : 0)
                    .filter(p => p > 0);
                if (positions.length > 0) {
                    if (rqBar) rqBar.style.width = '0%';
                    if (rqText) rqText.innerText = `Queued (#${positions[0]})`;
                } else {
                    if (rqBar) rqBar.style.width = '0%';
                    if (rqText) rqText.innerText = 'Idle';
                }
            }
        } else {
            if (rqBar) rqBar.style.width = '0%';
            if (rqText) rqText.innerText = '';
        }
    }

    drawMinimap() { /* ... same ... */
        const ctx = this.minimapCtx;
        if (!ctx) return;
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
        const scaleX = w / this.game.canvas.width;
        const scaleY = h / this.game.canvas.height;

        this.game.entities.forEach(e => {
            const mx = e.x * scaleX;
            const my = e.y * scaleY;
            if (e.constructor.name === 'Hero') { ctx.fillStyle = e.color; ctx.fillRect(mx - 1, my - 1, 3, 3); }
            else if (e.constructor.name === 'Monster') { ctx.fillStyle = 'red'; ctx.fillRect(mx - 1, my - 1, 2, 2); }
            else if (e instanceof EconomicBuilding || e.constructor.name === 'EconomicBuilding') {
                ctx.fillStyle = e.color || '#888'; ctx.fillRect(mx - 2, my - 2, 5, 5);
                if (e === this.selectedEntity) { ctx.strokeStyle = 'white'; ctx.strokeRect(mx - 3, my - 3, 7, 7); }
            }
        });
        ctx.strokeStyle = '#333'; ctx.strokeRect(0, 0, w, h);
    }
}
