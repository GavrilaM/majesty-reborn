export class Inventory {
    constructor(capacity = 4) {
        this.capacity = capacity;
        this.items = []; // Array of Item Objects
    }

    add(item) {
        if (this.items.length >= this.capacity) {
            return false; // Full
        }
        this.items.push(item);
        return true;
    }

    remove(itemName) {
        const idx = this.items.findIndex(i => i.name === itemName);
        if (idx !== -1) {
            return this.items.splice(idx, 1)[0]; // Returns the removed item
        }
        return null;
    }

    has(itemName) {
        return this.items.some(i => i.name === itemName);
    }
    
    hasType(type) {
        return this.items.some(i => i.type === type);
    }

    get(itemName) {
        return this.items.find(i => i.name === itemName);
    }
}