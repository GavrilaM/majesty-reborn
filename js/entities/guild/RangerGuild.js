import { BaseGuild } from './BaseGuild.js';

export class RangerGuild extends BaseGuild {
    constructor(x, y, game) {
        super(x, y, game);
        this.guildClass = 'RANGER';
        this.allowedRecruits = ['RANGER'];
        this.name = 'Ranger Guild';
        this.color = '#5c8a3a';
    }
}

