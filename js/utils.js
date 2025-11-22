export const Utils = {
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    rand: (min, max) => Math.random() * (max - min) + min,
    clamp: (val, min, max) => Math.min(Math.max(val, min), max),

    drawSprite: (ctx, type, x, y, size, color) => {
        ctx.save();
        ctx.translate(x, y);
        
        if (type === 'hero') {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(0, -10, 10, 0, Math.PI*2); ctx.fill(); // Head
            ctx.fillRect(-5, 0, 10, 15); // Body
            // Health bar background
            ctx.fillStyle = 'black';
            ctx.fillRect(-10, -25, 20, 4);
        } 
        else if (type === 'monster') {
            ctx.fillStyle = color || '#c0392b';
            ctx.beginPath(); ctx.arc(0, 0, size/2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#f1c40f'; // Eyes
            ctx.fillRect(-4, -2, 2, 2); ctx.fillRect(2, -2, 2, 2);
        }
        else if (type === 'building') {
            ctx.fillStyle = '#7f8c8d';
            ctx.fillRect(-20, -20, 40, 40);
            ctx.fillStyle = '#8e44ad'; // Roof
            ctx.beginPath(); ctx.moveTo(-25, -20); ctx.lineTo(0, -40); ctx.lineTo(25, -20); ctx.fill();
        }
        else if (type === 'flag') {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -20); ctx.stroke(); 
            ctx.fillStyle = 'gold';
            ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(15, -15); ctx.lineTo(0, -10); ctx.fill();
        }

        ctx.restore();
    },

    generateFantasyName: (classType) => {
        const prefixes = ["Thor", "Gim", "Iron", "Swift", "Storm", "Shadow", "Bright", "Oak", "Stone", "Wind"];
        const suffixes = ["in", "ble", "heart", "foot", "blade", "walker", "shield", "might", "song", "shade"];
        const titles = ["the Brave", "the Greedy", "the Swift", "the Strong", "the Wise", "of the North", "Star-eye"];
        
        const name = prefixes[Math.floor(Math.random() * prefixes.length)] + 
                     suffixes[Math.floor(Math.random() * suffixes.length)];
        
        // 30% chance to have a title
        if (Math.random() < 0.3) {
            return name + " " + titles[Math.floor(Math.random() * titles.length)];
        }
        return name;
    }
};