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
}

