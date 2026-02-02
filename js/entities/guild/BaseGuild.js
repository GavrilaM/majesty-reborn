import { EconomicBuilding } from '../EconomicBuilding.js';
import { BUILDING_CONFIG } from '../../config/BuildingConfig.js';

export class BaseGuild extends EconomicBuilding {
    constructor(x, y, game) {
        super(x, y, 'GUILD', game);
        this.guildClass = 'BASE';
        this.allowedRecruits = [];
        this.name = 'Guild';
        const cfg = BUILDING_CONFIG['GUILD'];
        this.width = cfg.width;
        this.height = cfg.height;
        this.maxHp = cfg.hp;
        this.hp = this.maxHp;
    }

    update(dt, game) {
        super.update(dt, game);
        if (this.constructed) {
            // Passive Income: +5 gold every 10 seconds
            this.incomeTimer = (this.incomeTimer || 0) + dt;
            if (this.incomeTimer >= 10.0) {
                this.incomeTimer = 0;
                this.treasury = Math.min(this.treasury + 5, this.maxTreasury);
            }

            // Healing Fee Logic
            if (this.visitors.length > 0) {
                this.visitors.forEach(hero => {
                    if (hero.hp < hero.maxHp) {
                        // Hero is healing (handled by super)
                        // Charge fee: 20g/sec (1g per HP)
                        const cost = 20 * dt;
                        if (hero.gold >= cost) {
                            hero.gold -= cost;
                            this.treasury = Math.min(this.treasury + cost, this.maxTreasury);
                        }
                    }
                });
            }
        }
    }
}

