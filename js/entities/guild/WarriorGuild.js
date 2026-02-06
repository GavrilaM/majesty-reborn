import { BaseGuild } from './BaseGuild.js';

export class WarriorGuild extends BaseGuild {
    constructor(x, y, game) {
        super(x, y, game);
        this.guildClass = 'MERCENARY';
        // Keep 'WARRIOR' in allowedRecruits for backward compatibility
        // Hero constructor will convert WARRIOR -> MERCENARY
        this.allowedRecruits = ['WARRIOR', 'MERCENARY'];
        this.name = 'Mercenary Guild';
        this.color = '#8d6e63';
    }
}

