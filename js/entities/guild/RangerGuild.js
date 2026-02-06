import { BaseGuild } from './BaseGuild.js';

export class RangerGuild extends BaseGuild {
    constructor(x, y, game) {
        super(x, y, game);
        this.guildClass = 'WAYFARER';
        // Keep 'RANGER' in allowedRecruits for backward compatibility
        // Hero constructor will convert RANGER -> WAYFARER
        this.allowedRecruits = ['RANGER', 'WAYFARER'];
        this.name = 'Wayfarer Lodge';
        this.color = '#5c8a3a';
    }
}

