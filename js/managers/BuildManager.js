import { BUILDING_CONFIG } from '../config/BuildingConfig.js';
import { EconomicBuilding } from '../entities/EconomicBuilding.js';
import { WarriorGuild } from '../entities/guild/WarriorGuild.js';
import { RangerGuild } from '../entities/guild/RangerGuild.js';
import { Utils } from '../utils.js';

export class BuildManager {
    constructor(game) {
        this.game = game;
        this.activeType = null;
        this.isBuilding = false;
    }

    startBuild(type) {
        const baseType = (type === 'WARRIOR_GUILD' || type === 'RANGER_GUILD') ? 'GUILD' : type;
        const config = BUILDING_CONFIG[baseType];
        if (this.game.gold >= config.cost) {
            this.activeType = type;
            this.isBuilding = true;
            document.body.style.cursor = 'cell';
            
            if (this.game.flagMode) this.game.toggleFlagMode();
            this.game.ui.deselect(); 
        } else {
            console.log("Not enough gold");
        }
    }

    cancelBuild() {
        this.activeType = null;
        this.isBuilding = false;
        document.body.style.cursor = 'default';
    }

    canBuildAt(x, y, config) {
        if (x < 0 || x > this.game.canvas.width || y < 0 || y > this.game.canvas.height) return false;

        const buildRadius = Math.max(config.width, config.height) / 1.5;

        for (let e of this.game.entities) {
            if (e instanceof EconomicBuilding || e.constructor.name === 'Building') {
                const existingRadius = Math.max(e.width || 40, e.height || 40) / 1.5;
                const dist = Utils.dist(x, y, e.x, e.y);
                
                // Collision Check
                if (dist < (buildRadius + existingRadius + 10)) {
                    return false;
                }
            }
        }
        return true;
    }

    handleClick(x, y) {
        if (!this.isBuilding) return false;

        const baseType = (this.activeType === 'WARRIOR_GUILD' || this.activeType === 'RANGER_GUILD') ? 'GUILD' : this.activeType;
        const config = BUILDING_CONFIG[baseType];
        
        if (this.game.gold < config.cost) {
            this.cancelBuild();
            return true;
        }

        if (!this.canBuildAt(x, y, config)) {
            return true; // Blocked, but consume click
        }

        this.game.gold -= config.cost;
        let b;
        if (this.activeType === 'WARRIOR_GUILD') {
            b = new WarriorGuild(x, y, this.game);
        } else if (this.activeType === 'RANGER_GUILD') {
            b = new RangerGuild(x, y, this.game);
        } else {
            b = new EconomicBuilding(x, y, baseType, this.game);
        }
        if (this.activeType !== 'CASTLE') {
            b.hp = 0;
            b.constructed = false;
            b.isUnderConstruction = true;
        }
        this.game.entities.push(b);
        
        // Stop building after placement
        // Note: UIManager handles UI updates automatically in the game loop
        this.cancelBuild();
        return true;
    }

    drawPreview(ctx, mouseX, mouseY) {
        if (!this.isBuilding) return;

        const baseType = (this.activeType === 'WARRIOR_GUILD' || this.activeType === 'RANGER_GUILD') ? 'GUILD' : this.activeType;
        const config = BUILDING_CONFIG[baseType];
        const valid = this.canBuildAt(mouseX, mouseY, config);
        
        ctx.save();
        ctx.translate(mouseX, mouseY);
        ctx.globalAlpha = 0.6;
        
        ctx.fillStyle = valid ? config.color : 'red';
        ctx.fillRect(-config.width/2, -config.height/2, config.width, config.height);
        
        if (this.activeType === 'TOWER') {
            ctx.beginPath();
            ctx.arc(0, 0, config.attackRange, 0, Math.PI*2);
            ctx.strokeStyle = valid ? 'white' : 'red';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
        }

        ctx.restore();
    }
}
