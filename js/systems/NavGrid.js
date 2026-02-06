/**
* NavGrid - Navigation Grid System for A* Pathfinding
* 
* This class manages a grid of cells that represent walkable/blocked areas.
* Buildings and other static obstacles mark cells as blocked.
*/

export class NavGrid {
    /**
     * Create a navigation grid
     * @param {number} worldWidth - Width of the game world in pixels
     * @param {number} worldHeight - Height of the game world in pixels
     * @param {number} cellSize - Size of each cell in pixels (default 20)
     */
    constructor(worldWidth, worldHeight, cellSize = 20) {
        this.cellSize = cellSize;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;

        // Calculate grid dimensions
        this.gridWidth = Math.ceil(worldWidth / cellSize);
        this.gridHeight = Math.ceil(worldHeight / cellSize);

        // Initialize grid - 0 = walkable, >0 = blocked (count of blockers)
        // Using a count allows overlapping obstacles to work correctly
        this.grid = new Array(this.gridWidth * this.gridHeight).fill(0);

        // For debugging
        this.debugMode = false;
    }

    /**
     * Convert world coordinates to grid cell coordinates
     * @param {number} worldX - World X coordinate
     * @param {number} worldY - World Y coordinate
     * @returns {{x: number, y: number}} Grid cell coordinates
     */
    worldToGrid(worldX, worldY) {
        return {
            x: Math.floor(worldX / this.cellSize),
            y: Math.floor(worldY / this.cellSize)
        };
    }

    /**
     * Convert grid cell coordinates to world coordinates (center of cell)
     * @param {number} gridX - Grid X coordinate
     * @param {number} gridY - Grid Y coordinate
     * @returns {{x: number, y: number}} World coordinates (center of cell)
     */
    gridToWorld(gridX, gridY) {
        return {
            x: (gridX + 0.5) * this.cellSize,
            y: (gridY + 0.5) * this.cellSize
        };
    }

    /**
     * Get the index in the flat grid array for given coordinates
     * @param {number} x - Grid X coordinate
     * @param {number} y - Grid Y coordinate
     * @returns {number} Array index, or -1 if out of bounds
     */
    getIndex(x, y) {
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
            return -1;
        }
        return y * this.gridWidth + x;
    }

    /**
     * Check if a cell is walkable
     * @param {number} gridX - Grid X coordinate
     * @param {number} gridY - Grid Y coordinate
     * @returns {boolean} True if walkable, false if blocked or out of bounds
     */
    isWalkable(gridX, gridY) {
        const idx = this.getIndex(gridX, gridY);
        if (idx === -1) return false; // Out of bounds = not walkable
        return this.grid[idx] === 0;
    }

    /**
     * Check if a world position is walkable
     * @param {number} worldX - World X coordinate
     * @param {number} worldY - World Y coordinate
     * @returns {boolean} True if walkable
     */
    isWorldPosWalkable(worldX, worldY) {
        const cell = this.worldToGrid(worldX, worldY);
        return this.isWalkable(cell.x, cell.y);
    }

    /**
     * Mark a rectangular area as blocked (e.g., building footprint)
     * @param {number} worldX - Center X of the area in world coordinates
     * @param {number} worldY - Center Y of the area in world coordinates  
     * @param {number} width - Width of the area in pixels
     * @param {number} height - Height of the area in pixels
     * @param {number} padding - Extra padding around the area (default 4px)
     */
    markBlocked(worldX, worldY, width, height, padding = 4) {
        const halfW = (width / 2) + padding;
        const halfH = (height / 2) + padding;

        const minCell = this.worldToGrid(worldX - halfW, worldY - halfH);
        const maxCell = this.worldToGrid(worldX + halfW, worldY + halfH);

        for (let y = minCell.y; y <= maxCell.y; y++) {
            for (let x = minCell.x; x <= maxCell.x; x++) {
                const idx = this.getIndex(x, y);
                if (idx !== -1) {
                    this.grid[idx]++;
                }
            }
        }
    }

    /**
     * Unmark a rectangular area (e.g., when building is destroyed)
     * @param {number} worldX - Center X of the area in world coordinates
     * @param {number} worldY - Center Y of the area in world coordinates
     * @param {number} width - Width of the area in pixels
     * @param {number} height - Height of the area in pixels
     * @param {number} padding - Extra padding around the area (default 4px)
     */
    unmarkBlocked(worldX, worldY, width, height, padding = 4) {
        const halfW = (width / 2) + padding;
        const halfH = (height / 2) + padding;

        const minCell = this.worldToGrid(worldX - halfW, worldY - halfH);
        const maxCell = this.worldToGrid(worldX + halfW, worldY + halfH);

        for (let y = minCell.y; y <= maxCell.y; y++) {
            for (let x = minCell.x; x <= maxCell.x; x++) {
                const idx = this.getIndex(x, y);
                if (idx !== -1 && this.grid[idx] > 0) {
                    this.grid[idx]--;
                }
            }
        }
    }

    /**
     * Get walkable neighbors of a cell (for A* algorithm)
     * @param {number} gridX - Grid X coordinate
     * @param {number} gridY - Grid Y coordinate
     * @param {boolean} allowDiagonal - Allow diagonal movement (default true)
     * @returns {Array<{x: number, y: number, cost: number}>} Array of walkable neighbors
     */
    getNeighbors(gridX, gridY, allowDiagonal = true) {
        const neighbors = [];

        // Cardinal directions (cost = 1.0)
        const cardinalDirs = [
            { dx: 0, dy: -1 }, // North
            { dx: 1, dy: 0 },  // East
            { dx: 0, dy: 1 },  // South
            { dx: -1, dy: 0 }  // West
        ];

        // Diagonal directions (cost = 1.414)
        const diagonalDirs = [
            { dx: 1, dy: -1 },  // NE
            { dx: 1, dy: 1 },   // SE
            { dx: -1, dy: 1 },  // SW
            { dx: -1, dy: -1 }  // NW
        ];

        // Check cardinal directions
        for (const dir of cardinalDirs) {
            const nx = gridX + dir.dx;
            const ny = gridY + dir.dy;
            if (this.isWalkable(nx, ny)) {
                neighbors.push({ x: nx, y: ny, cost: 1.0 });
            }
        }

        // Check diagonal directions
        if (allowDiagonal) {
            for (const dir of diagonalDirs) {
                const nx = gridX + dir.dx;
                const ny = gridY + dir.dy;

                // For diagonal movement, also check that both adjacent cardinals are walkable
                // This prevents cutting corners through walls
                const adjX = gridX + dir.dx;
                const adjY = gridY + dir.dy;
                const cardinalXWalkable = this.isWalkable(gridX + dir.dx, gridY);
                const cardinalYWalkable = this.isWalkable(gridX, gridY + dir.dy);

                if (this.isWalkable(nx, ny) && cardinalXWalkable && cardinalYWalkable) {
                    neighbors.push({ x: nx, y: ny, cost: 1.414 });
                }
            }
        }

        return neighbors;
    }

    /**
     * Calculate heuristic distance between two cells (for A* algorithm)
     * Using Euclidean distance for smoother paths
     * @param {number} x1 - Start X
     * @param {number} y1 - Start Y
     * @param {number} x2 - End X
     * @param {number} y2 - End Y
     * @returns {number} Estimated distance
     */
    heuristic(x1, y1, x2, y2) {
        // Euclidean distance - produces smoother, more natural paths
        return Math.hypot(x2 - x1, y2 - y1);
    }

    /**
     * Draw debug visualization of the grid
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    drawDebug(ctx) {
        if (!this.debugMode) return;

        ctx.save();
        ctx.globalAlpha = 0.3;

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const idx = this.getIndex(x, y);
                const blocked = this.grid[idx] > 0;

                ctx.fillStyle = blocked ? '#ff0000' : '#00ff00';
                ctx.fillRect(
                    x * this.cellSize + 1,
                    y * this.cellSize + 1,
                    this.cellSize - 2,
                    this.cellSize - 2
                );
            }
        }

        // Draw grid lines
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.1;

        for (let x = 0; x <= this.gridWidth; x++) {
            ctx.beginPath();
            ctx.moveTo(x * this.cellSize, 0);
            ctx.lineTo(x * this.cellSize, this.worldHeight);
            ctx.stroke();
        }

        for (let y = 0; y <= this.gridHeight; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * this.cellSize);
            ctx.lineTo(this.worldWidth, y * this.cellSize);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Reset the entire grid to walkable
     */
    reset() {
        this.grid.fill(0);
    }

    /**
     * Get grid statistics for debugging
     * @returns {{total: number, blocked: number, walkable: number}}
     */
    getStats() {
        const total = this.grid.length;
        const blocked = this.grid.filter(c => c > 0).length;
        return {
            total,
            blocked,
            walkable: total - blocked,
            dimensions: `${this.gridWidth}x${this.gridHeight}`
        };
    }
}
