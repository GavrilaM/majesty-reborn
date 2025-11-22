import { Utils } from '../utils.js';

export class Flag {
    constructor(x, y, reward) {
        this.x = x;
        this.y = y;
        this.reward = reward;
        this.remove = false;
    }

    update(dt, game) {
        // Flags don't move, they just wait to be claimed
    }

    draw(ctx) {
        Utils.drawSprite(ctx, 'flag', this.x, this.y);
        
        // Draw reward amount text
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.fillText(this.reward + 'g', this.x - 10, this.y + 15);
    }
}