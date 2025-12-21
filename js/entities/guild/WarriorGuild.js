import { BaseGuild } from './BaseGuild.js';

export class WarriorGuild extends BaseGuild {
    constructor(x, y, game) {
        super(x, y, game);
        this.guildClass = 'WARRIOR';
        this.allowedRecruits = ['WARRIOR'];
        this.name = 'Warrior Guild';
        this.color = '#8d6e63';
    }
}

