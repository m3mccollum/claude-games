import { tileById } from './constants.js';

// A placed structure on the grid. Owns its own state so future systems
// (production, upgrades, damage, garrisons, save/load) can attach here
// without touching grid storage or rendering.
export class Building {
    constructor({ id, typeId, row, col }) {
        this.id = id;
        this.typeId = typeId;
        this.row = row;
        this.col = col;
        this.graphic = null;
    }

    get type() {
        return tileById[this.typeId];
    }
}
