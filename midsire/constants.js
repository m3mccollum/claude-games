// Grid / board geometry
export const GRID_SIZE = 11;
export const CELL_SIZE = 56;
export const GRID_PADDING = 24;
export const BOARD_PIXELS = GRID_SIZE * CELL_SIZE + GRID_PADDING * 2;
export const BOARD_PIXELS_INNER = GRID_SIZE * CELL_SIZE;

// Citizen visuals
export const CITIZEN_RADIUS = 4;
export const CITIZEN_COLOR = 0x4ade80;

// Building catalog
export const TILE_TYPES = [
    { id: 'house', name: 'House', cost: 100,  color: 0xc97b5a, shape: 'roof' },
    { id: 'tower', name: 'Tower', cost: 1500, color: 0xd9d9d9, shape: 'tower' },
];

export const tileById = Object.fromEntries(TILE_TYPES.map(t => [t.id, t]));
