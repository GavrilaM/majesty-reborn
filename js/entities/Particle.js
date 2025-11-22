export class Particle {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text; // e.g. "-10" or "Level Up!"
        this.color = color;
        this.life = 1.0; // Lives for 1 second
        this.velocity = { x: (Math.random() - 0.5) * 20, y: -30 }; // Floats up
        this.remove = false;
    }

    update(dt) {
        this.life -= dt;
        this.x += this.velocity.x * dt;
        this.y += this.velocity.y * dt;

        if (this.life <= 0) this.remove = true;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life; // Fade out
        ctx.fillStyle = this.color;
        ctx.font = "bold 14px Arial";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.strokeText(this.text, this.x, this.y);
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}