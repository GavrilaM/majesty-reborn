export class DebugLogger {
    static enabled = true;
    static filter = new Set(['SHOP', 'RETREAT', 'ENTER', 'EXIT', 'STATE', 'BUILDING']);
    static history = [];
    static maxHistory = 500;
    static log(category, entity, message, data = {}) {
        if (!DebugLogger.enabled) return;
        if (DebugLogger.filter.size > 0 && !DebugLogger.filter.has(category)) return;
        const name = typeof entity === 'string' ? entity : (entity?.name || entity?.id || (entity?.constructor && entity.constructor.name) || 'Entity');
        const entry = { time: (typeof performance !== 'undefined' ? performance.now() : Date.now()), category, name, message, data };
        DebugLogger.history.push(entry);
        if (DebugLogger.history.length > DebugLogger.maxHistory) DebugLogger.history.shift();
        try {
            console.log(`[${category}] ${name}: ${message}`, data);
        } catch {
            /* noop */
        }
    }
    static dumpHistory(filter = null) {
        const arr = filter ? DebugLogger.history.filter(e => e.category === filter) : DebugLogger.history;
        try { console.table(arr); } catch { console.log(arr); }
    }
    static findStuckHeroes() {
        const byHero = new Map();
        for (const e of DebugLogger.history) {
            if (!byHero.has(e.name)) byHero.set(e.name, []);
            byHero.get(e.name).push(e);
        }
        byHero.forEach((logs, name) => {
            const shopLogs = logs.filter(l => l.category === 'SHOP');
            if (shopLogs.length > 10) {
                const lastEnter = [...shopLogs].reverse().find(l => l.message.includes('ENTER'));
                const lastExit = [...shopLogs].reverse().find(l => l.message.includes('EXIT'));
                if (lastEnter && (!lastExit || lastEnter.time > lastExit.time)) {
                    console.warn(`STUCK DETECTED: ${name}`, { lastEnter, lastExit });
                }
            }
        });
    }
}

