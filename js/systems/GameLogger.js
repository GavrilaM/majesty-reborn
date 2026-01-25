// GameLogger - Comprehensive activity logging system
// Logs to console with timestamps and categories

export class GameLogger {
    static enabled = true;
    static categories = new Set(['SPAWN', 'DEATH', 'STATE', 'COMBAT', 'SHOP', 'BUILDING', 'TARGET', 'VISIBILITY']);
    static logs = [];
    static maxLogs = 1000;
    static startTime = Date.now();

    static log(category, entity, action, details = {}) {
        if (!GameLogger.enabled) return;
        if (GameLogger.categories.size > 0 && !GameLogger.categories.has(category)) return;

        const elapsed = ((Date.now() - GameLogger.startTime) / 1000).toFixed(1);
        const name = GameLogger.getName(entity);
        const entry = {
            time: elapsed,
            cat: category,
            entity: name,
            action,
            ...details
        };

        GameLogger.logs.push(entry);
        if (GameLogger.logs.length > GameLogger.maxLogs) GameLogger.logs.shift();

        // Console output with color coding
        const color = GameLogger.getColor(category);
        console.log(`%c[${elapsed}s] [${category}] ${name}: ${action}`, `color: ${color}`, details);
    }

    static getName(entity) {
        if (typeof entity === 'string') return entity;
        if (!entity) return 'Unknown';
        if (entity.name) return entity.name;
        if (entity.type) return `${entity.constructor.name}:${entity.type}`;
        if (entity.id) return entity.id;
        return entity.constructor?.name || 'Entity';
    }

    static getColor(category) {
        const colors = {
            SPAWN: '#00ff00',
            DEATH: '#ff0000',
            STATE: '#ffff00',
            COMBAT: '#ff6600',
            SHOP: '#00ffff',
            BUILDING: '#ff00ff',
            TARGET: '#9999ff',
            VISIBILITY: '#ff99ff'
        };
        return colors[category] || '#ffffff';
    }

    // Quick dump of recent logs
    static dump(filter = null, count = 50) {
        let arr = filter ? GameLogger.logs.filter(e => e.cat === filter) : GameLogger.logs;
        arr = arr.slice(-count);
        console.table(arr);
    }

    // Find suspicious patterns
    static findIssues() {
        const issues = [];

        // Find heroes that became invisible without entering building
        const visibilityLogs = GameLogger.logs.filter(l => l.cat === 'VISIBILITY');
        visibilityLogs.forEach(l => {
            if (l.action.includes('INVISIBLE') && !l.action.includes('BUILDING')) {
                issues.push(`SUSPICIOUS: ${l.entity} became invisible without building entry`);
            }
        });

        // Find monsters stuck on same target too long
        const targetLogs = GameLogger.logs.filter(l => l.cat === 'TARGET');
        // Group by entity
        const byEntity = new Map();
        targetLogs.forEach(l => {
            if (!byEntity.has(l.entity)) byEntity.set(l.entity, []);
            byEntity.get(l.entity).push(l);
        });

        issues.forEach(i => console.warn(i));
        return issues;
    }

    // Enable/disable categories
    static enable(cat) { GameLogger.categories.add(cat); }
    static disable(cat) { GameLogger.categories.delete(cat); }
    static enableAll() {
        GameLogger.categories = new Set(['SPAWN', 'DEATH', 'STATE', 'COMBAT', 'SHOP', 'BUILDING', 'TARGET', 'VISIBILITY']);
    }
}

// Make it globally accessible for debugging
if (typeof window !== 'undefined') {
    window.GameLogger = GameLogger;
}
