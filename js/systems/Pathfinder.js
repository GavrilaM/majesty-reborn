/**
 * Pathfinder - A* Pathfinding Algorithm
 * 
 * Uses the NavGrid to find optimal paths around obstacles.
 * Returns a series of waypoints for entities to follow.
 */

export class Pathfinder {
    /**
     * Create a pathfinder instance
     * @param {NavGrid} navGrid - The navigation grid to use
     */
    constructor(navGrid) {
        this.navGrid = navGrid;

        // Path caching for performance
        this.pathCache = new Map();
        this.cacheTimeout = 1000; // Cache paths for 1 second

        // Performance limits
        this.maxIterations = 1000; // Prevent infinite loops
        this.maxPathLength = 200;  // Maximum waypoints
    }

    /**
     * Find a path from start to goal using A* algorithm
     * @param {number} startX - Start world X coordinate
     * @param {number} startY - Start world Y coordinate
     * @param {number} goalX - Goal world X coordinate
     * @param {number} goalY - Goal world Y coordinate
     * @param {Object} options - Optional settings
     * @returns {Array<{x: number, y: number}>|null} Array of waypoints (world coords), or null if no path
     */
    findPath(startX, startY, goalX, goalY, options = {}) {
        const grid = this.navGrid;

        // Convert world coordinates to grid coordinates
        const start = grid.worldToGrid(startX, startY);
        const goal = grid.worldToGrid(goalX, goalY);

        // Quick checks
        if (start.x === goal.x && start.y === goal.y) {
            return [{ x: goalX, y: goalY }]; // Already at goal
        }

        // If goal is blocked, find nearest walkable cell
        let actualGoal = goal;
        if (!grid.isWalkable(goal.x, goal.y)) {
            actualGoal = this.findNearestWalkable(goal.x, goal.y);
            if (!actualGoal) {
                return null; // No walkable cell near goal
            }
        }

        // Check cache
        const cacheKey = `${start.x},${start.y}-${actualGoal.x},${actualGoal.y}`;
        const cached = this.pathCache.get(cacheKey);
        if (cached && Date.now() - cached.time < this.cacheTimeout) {
            return cached.path;
        }

        // A* Algorithm
        const openSet = new MinHeap();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const startKey = `${start.x},${start.y}`;
        gScore.set(startKey, 0);
        fScore.set(startKey, grid.heuristic(start.x, start.y, actualGoal.x, actualGoal.y));
        openSet.push({ x: start.x, y: start.y, f: fScore.get(startKey) });

        let iterations = 0;

        while (!openSet.isEmpty() && iterations < this.maxIterations) {
            iterations++;

            const current = openSet.pop();
            const currentKey = `${current.x},${current.y}`;

            // Reached goal?
            if (current.x === actualGoal.x && current.y === actualGoal.y) {
                const path = this.reconstructPath(cameFrom, current, grid, goalX, goalY);

                // Cache the result
                this.pathCache.set(cacheKey, { path, time: Date.now() });

                return path;
            }

            closedSet.add(currentKey);

            // Check all neighbors
            const neighbors = grid.getNeighbors(current.x, current.y, true);

            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.x},${neighbor.y}`;

                if (closedSet.has(neighborKey)) {
                    continue; // Already evaluated
                }

                const tentativeG = (gScore.get(currentKey) || Infinity) + neighbor.cost;

                if (tentativeG < (gScore.get(neighborKey) || Infinity)) {
                    // This path is better
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeG);
                    fScore.set(neighborKey, tentativeG + grid.heuristic(neighbor.x, neighbor.y, actualGoal.x, actualGoal.y));

                    // Add to open set if not already there
                    if (!openSet.contains(neighborKey)) {
                        openSet.push({ x: neighbor.x, y: neighbor.y, f: fScore.get(neighborKey), key: neighborKey });
                    }
                }
            }
        }

        // No path found
        return null;
    }

    /**
     * Reconstruct path from A* result
     * @param {Map} cameFrom - Parent map from A*
     * @param {Object} current - Goal cell
     * @param {NavGrid} grid - Navigation grid
     * @param {number} goalX - Original goal world X
     * @param {number} goalY - Original goal world Y
     * @returns {Array<{x: number, y: number}>} Waypoints in world coordinates
     */
    reconstructPath(cameFrom, current, grid, goalX, goalY) {
        const path = [];
        let node = current;

        while (node) {
            const worldPos = grid.gridToWorld(node.x, node.y);
            path.unshift(worldPos);
            const key = `${node.x},${node.y}`;
            node = cameFrom.get(key);
        }

        // Replace last waypoint with exact goal position for precision
        if (path.length > 0) {
            path[path.length - 1] = { x: goalX, y: goalY };
        }

        // Smooth the path (remove unnecessary waypoints)
        return this.smoothPath(path);
    }

    /**
     * Smooth path by removing unnecessary waypoints
     * Uses line-of-sight checks to skip intermediate points
     * @param {Array<{x: number, y: number}>} path - Original path
     * @returns {Array<{x: number, y: number}>} Smoothed path
     */
    smoothPath(path) {
        if (path.length <= 2) return path;

        const smoothed = [path[0]];
        let current = 0;

        while (current < path.length - 1) {
            let furthest = current + 1;

            // Find the furthest point we can reach directly
            for (let i = path.length - 1; i > current + 1; i--) {
                if (this.hasLineOfSight(path[current], path[i])) {
                    furthest = i;
                    break;
                }
            }

            smoothed.push(path[furthest]);
            current = furthest;
        }

        return smoothed;
    }

    /**
     * Check if there's a clear line of sight between two points
     * @param {Object} from - Start point {x, y}
     * @param {Object} to - End point {x, y}
     * @returns {boolean} True if path is clear
     */
    hasLineOfSight(from, to) {
        const grid = this.navGrid;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.hypot(dx, dy);
        const steps = Math.ceil(distance / (grid.cellSize * 0.5));

        if (steps === 0) return true;

        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = from.x + dx * t;
            const y = from.y + dy * t;

            if (!grid.isWorldPosWalkable(x, y)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Find the nearest walkable cell to a blocked position
     * @param {number} gridX - Grid X coordinate
     * @param {number} gridY - Grid Y coordinate
     * @param {number} maxRadius - Maximum search radius (default 10)
     * @returns {{x: number, y: number}|null} Nearest walkable cell or null
     */
    findNearestWalkable(gridX, gridY, maxRadius = 10) {
        const grid = this.navGrid;

        // Spiral outward search
        for (let r = 1; r <= maxRadius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    // Only check cells at the current radius
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

                    const nx = gridX + dx;
                    const ny = gridY + dy;

                    if (grid.isWalkable(nx, ny)) {
                        return { x: nx, y: ny };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Clear the path cache
     */
    clearCache() {
        this.pathCache.clear();
    }

    /**
     * Draw debug path visualization
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array<{x: number, y: number}>} path - Path to draw
     * @param {string} color - Path color (default cyan)
     */
    drawDebugPath(ctx, path, color = '#00ffff') {
        if (!path || path.length < 2) return;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.globalAlpha = 0.7;

        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);

        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }

        ctx.stroke();

        // Draw waypoint markers
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        for (const point of path) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}


/**
 * MinHeap - Priority Queue for A* algorithm
 * Efficient O(log n) insert and extract-min operations
 */
class MinHeap {
    constructor() {
        this.heap = [];
        this.indices = new Map(); // Track positions for contains() check
    }

    push(node) {
        this.heap.push(node);
        const idx = this.heap.length - 1;
        if (node.key) this.indices.set(node.key, idx);
        this.bubbleUp(idx);
    }

    pop() {
        if (this.heap.length === 0) return null;

        const min = this.heap[0];
        const last = this.heap.pop();

        if (this.heap.length > 0) {
            this.heap[0] = last;
            if (last.key) this.indices.set(last.key, 0);
            this.bubbleDown(0);
        }

        if (min.key) this.indices.delete(min.key);
        return min;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    contains(key) {
        return this.indices.has(key);
    }

    bubbleUp(idx) {
        while (idx > 0) {
            const parentIdx = Math.floor((idx - 1) / 2);
            if (this.heap[idx].f >= this.heap[parentIdx].f) break;

            this.swap(idx, parentIdx);
            idx = parentIdx;
        }
    }

    bubbleDown(idx) {
        const length = this.heap.length;

        while (true) {
            const leftIdx = 2 * idx + 1;
            const rightIdx = 2 * idx + 2;
            let smallest = idx;

            if (leftIdx < length && this.heap[leftIdx].f < this.heap[smallest].f) {
                smallest = leftIdx;
            }

            if (rightIdx < length && this.heap[rightIdx].f < this.heap[smallest].f) {
                smallest = rightIdx;
            }

            if (smallest === idx) break;

            this.swap(idx, smallest);
            idx = smallest;
        }
    }

    swap(i, j) {
        const temp = this.heap[i];
        this.heap[i] = this.heap[j];
        this.heap[j] = temp;

        if (this.heap[i].key) this.indices.set(this.heap[i].key, i);
        if (this.heap[j].key) this.indices.set(this.heap[j].key, j);
    }
}
