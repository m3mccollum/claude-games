// ---------------------------------------------------------------------------
// Constants & tile catalog
// ---------------------------------------------------------------------------
const GRID_SIZE = 11;
const CELL_SIZE = 56;
const GRID_PADDING = 24;
const BOARD_PIXELS = GRID_SIZE * CELL_SIZE + GRID_PADDING * 2;

const TILE_TYPES = [
    { id: 'house', name: 'House', cost: 100,  color: 0xc97b5a, shape: 'roof' },
    { id: 'tower', name: 'Tower', cost: 1500, color: 0xd9d9d9, shape: 'tower' },
];

const tileById = Object.fromEntries(TILE_TYPES.map(t => [t.id, t]));

// ---------------------------------------------------------------------------
// Building entity
// Each placed structure is its own object so future systems (production,
// upgrades, damage, selection, save/load) can attach to it directly.
// ---------------------------------------------------------------------------
class Building {
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

// ---------------------------------------------------------------------------
// Citizen entity
// Lives in board-relative pixel coordinates (independent of the board's
// position on screen). Wanders by picking a random target, walking to it,
// dwelling briefly, then picking another.
// ---------------------------------------------------------------------------
const BOARD_PIXELS_INNER = GRID_SIZE * CELL_SIZE;
const CITIZEN_RADIUS = 4;
const CITIZEN_COLOR = 0x4ade80;

class Citizen {
    constructor({ id, x, y }) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.speed = 18;          // pixels / second
        this.dwellTime = 0;       // seconds remaining to idle at target
        this.graphic = null;
        this.pickNewTarget();
    }

    pickNewTarget() {
        const margin = CITIZEN_RADIUS;
        this.targetX = margin + Math.random() * (BOARD_PIXELS_INNER - margin * 2);
        this.targetY = margin + Math.random() * (BOARD_PIXELS_INNER - margin * 2);
    }

    update(dt) {
        if (this.dwellTime > 0) {
            this.dwellTime -= dt;
            if (this.dwellTime <= 0) this.pickNewTarget();
            return;
        }
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.5) {
            this.dwellTime = 0.5 + Math.random() * 1.5;
            return;
        }
        const step = this.speed * dt;
        if (step >= dist) {
            this.x = this.targetX;
            this.y = this.targetY;
        } else {
            this.x += (dx / dist) * step;
            this.y += (dy / dist) * step;
        }
    }
}

// ---------------------------------------------------------------------------
// Game state
// `grid` stores the building id (or null) at each cell so lookups are O(1).
// `buildings` and `citizens` are the authoritative entity stores keyed by id.
// ---------------------------------------------------------------------------
const state = {
    currency: 1_000_000,
    grid: Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null)),
    buildings: new Map(),
    citizens: new Map(),
    nextBuildingId: 1,
    nextCitizenId: 1,
    tool: 'build',     // 'build' | 'demolish'
    drag: null,
};

function getBuildingAt(row, col) {
    const id = state.grid[row][col];
    return id === null ? null : state.buildings.get(id);
}

function createBuilding(typeId, row, col) {
    const building = new Building({
        id: state.nextBuildingId++,
        typeId,
        row,
        col,
    });
    state.buildings.set(building.id, building);
    state.grid[row][col] = building.id;
    return building;
}

function removeBuilding(buildingId) {
    const b = state.buildings.get(buildingId);
    if (!b) return null;
    if (b.graphic) b.graphic.destroy();
    state.grid[b.row][b.col] = null;
    state.buildings.delete(buildingId);
    return b;
}

function spawnCitizenAtCell(row, col) {
    const jitter = 8;
    const cx = col * CELL_SIZE + CELL_SIZE / 2 + (Math.random() - 0.5) * jitter;
    const cy = row * CELL_SIZE + CELL_SIZE / 2 + (Math.random() - 0.5) * jitter;
    const citizen = new Citizen({ id: state.nextCitizenId++, x: cx, y: cy });
    state.citizens.set(citizen.id, citizen);
    return citizen;
}

// ---------------------------------------------------------------------------
// DOM refs & utilities
// ---------------------------------------------------------------------------
const currencyEl = document.getElementById('currency-amount');
const shopItemsEl = document.getElementById('shop-items');
const demolishBtn = document.getElementById('tool-demolish');

const formatCurrency = n => n.toLocaleString();
const colorToCss = int => '#' + int.toString(16).padStart(6, '0');

function updateCurrencyDisplay() {
    currencyEl.textContent = formatCurrency(state.currency);
    document.querySelectorAll('.shop-item').forEach(el => {
        const cost = Number(el.dataset.cost);
        el.classList.toggle('unaffordable', state.currency < cost);
    });
}

// ---------------------------------------------------------------------------
// Shop UI
// ---------------------------------------------------------------------------
function buildShop() {
    TILE_TYPES.forEach(tile => {
        const item = document.createElement('div');
        item.className = 'shop-item';
        item.dataset.tileId = tile.id;
        item.dataset.cost = tile.cost;
        item.draggable = false;
        item.innerHTML = `
            <div class="shop-item-swatch" style="background:${colorToCss(tile.color)}"></div>
            <div class="shop-item-info">
                <span class="shop-item-name">${tile.name}</span>
                <span class="shop-item-cost">${formatCurrency(tile.cost)} coins</span>
            </div>
        `;
        item.addEventListener('pointerdown', e => startDrag(e, tile));
        shopItemsEl.appendChild(item);
    });
}

// ---------------------------------------------------------------------------
// Tool selection
// ---------------------------------------------------------------------------
function setTool(tool) {
    if (state.tool === tool) return;
    if (state.drag) cancelDrag();
    state.tool = tool;
    document.body.classList.toggle('mode-demolish', tool === 'demolish');
    demolishBtn.classList.toggle('active', tool === 'demolish');
    if (gameScene) gameScene.clearHover();
}

demolishBtn.addEventListener('click', () => {
    setTool(state.tool === 'demolish' ? 'build' : 'demolish');
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') setTool('build');
});

// ---------------------------------------------------------------------------
// Drag-from-shop placement
// ---------------------------------------------------------------------------
const ghostEl = document.createElement('div');
ghostEl.id = 'drag-ghost';
document.body.appendChild(ghostEl);

function startDrag(e, tile) {
    if (state.tool !== 'build') return;
    if (state.currency < tile.cost) return;
    e.preventDefault();
    state.drag = { tile, pointerId: e.pointerId };
    ghostEl.style.background = colorToCss(tile.color);
    ghostEl.style.display = 'block';
    moveGhost(e.clientX, e.clientY);
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp);
    window.addEventListener('pointercancel', onDragUp);
}

function moveGhost(x, y) {
    ghostEl.style.left = x + 'px';
    ghostEl.style.top = y + 'px';
}

function onDragMove(e) {
    if (!state.drag) return;
    moveGhost(e.clientX, e.clientY);
    if (gameScene) gameScene.updateBuildHover(e.clientX, e.clientY);
}

function onDragUp(e) {
    if (!state.drag) return;
    const cell = gameScene ? gameScene.cellAtClient(e.clientX, e.clientY) : null;
    if (cell && state.grid[cell.row][cell.col] === null) {
        const tile = state.drag.tile;
        if (state.currency >= tile.cost) {
            state.currency -= tile.cost;
            const building = createBuilding(tile.id, cell.row, cell.col);
            gameScene.renderBuilding(building);
            if (building.typeId === 'house') {
                const citizen = spawnCitizenAtCell(building.row, building.col);
                gameScene.renderCitizen(citizen);
            }
            updateCurrencyDisplay();
        }
    }
    cancelDrag();
}

function cancelDrag() {
    state.drag = null;
    ghostEl.style.display = 'none';
    if (gameScene) gameScene.clearHover();
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    window.removeEventListener('pointercancel', onDragUp);
}

// ---------------------------------------------------------------------------
// Demolish-tool input (canvas pointer events bubble up to the container)
// ---------------------------------------------------------------------------
const gameContainerEl = document.getElementById('game-container');

gameContainerEl.addEventListener('pointermove', e => {
    if (state.tool !== 'demolish' || !gameScene) return;
    gameScene.updateDemolishHover(e.clientX, e.clientY);
});

gameContainerEl.addEventListener('pointerleave', () => {
    if (state.tool === 'demolish' && gameScene) gameScene.clearHover();
});

gameContainerEl.addEventListener('pointerdown', e => {
    if (state.tool !== 'demolish' || !gameScene) return;
    const cell = gameScene.cellAtClient(e.clientX, e.clientY);
    if (!cell) return;
    const building = getBuildingAt(cell.row, cell.col);
    if (!building) return;
    removeBuilding(building.id);
    gameScene.updateDemolishHover(e.clientX, e.clientY);
});

// ---------------------------------------------------------------------------
// Phaser scene — pure renderer that mirrors `state`
// ---------------------------------------------------------------------------
let gameScene = null;

class BoardScene extends Phaser.Scene {
    constructor() {
        super('BoardScene');
    }

    create() {
        gameScene = this;
        this.cameras.main.setBackgroundColor('#0f1218');
        this.boardOffsetX = GRID_PADDING;
        this.boardOffsetY = GRID_PADDING;

        this.add.rectangle(
            this.boardOffsetX - 6,
            this.boardOffsetY - 6,
            GRID_SIZE * CELL_SIZE + 12,
            GRID_SIZE * CELL_SIZE + 12,
            0x1c2029
        ).setOrigin(0, 0).setStrokeStyle(1, 0x2a2f3a);

        this.gridGraphics = this.add.graphics();
        this.drawGrid();

        this.hoverGraphics = this.add.graphics();
        this.buildingLayer = this.add.container(0, 0);
        this.citizenLayer = this.add.container(0, 0);
    }

    update(_time, deltaMs) {
        const dt = deltaMs / 1000;
        for (const citizen of state.citizens.values()) {
            citizen.update(dt);
            if (citizen.graphic) {
                citizen.graphic.setPosition(
                    this.boardOffsetX + citizen.x,
                    this.boardOffsetY + citizen.y
                );
            }
        }
    }

    drawGrid() {
        const g = this.gridGraphics;
        g.clear();
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const x = this.boardOffsetX + c * CELL_SIZE;
                const y = this.boardOffsetY + r * CELL_SIZE;
                g.fillStyle((r + c) % 2 === 0 ? 0x232833 : 0x1e222c, 1);
                g.fillRect(x, y, CELL_SIZE, CELL_SIZE);
                g.lineStyle(1, 0x2a2f3a, 1);
                g.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
            }
        }
    }

    cellAtClient(clientX, clientY) {
        const canvas = this.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const localX = (clientX - rect.left) * (canvas.width / rect.width);
        const localY = (clientY - rect.top) * (canvas.height / rect.height);
        const c = Math.floor((localX - this.boardOffsetX) / CELL_SIZE);
        const r = Math.floor((localY - this.boardOffsetY) / CELL_SIZE);
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return null;
        return { row: r, col: c };
    }

    drawHoverRect(cell, color, fillAlpha = 0.15, strokeAlpha = 1) {
        const g = this.hoverGraphics;
        g.clear();
        if (!cell) return;
        const x = this.boardOffsetX + cell.col * CELL_SIZE;
        const y = this.boardOffsetY + cell.row * CELL_SIZE;
        g.lineStyle(3, color, strokeAlpha);
        g.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        g.fillStyle(color, fillAlpha);
        g.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }

    updateBuildHover(clientX, clientY) {
        const cell = this.cellAtClient(clientX, clientY);
        if (!cell) { this.hoverGraphics.clear(); return; }
        const occupied = state.grid[cell.row][cell.col] !== null;
        this.drawHoverRect(cell, occupied ? 0xd95a5a : 0xffd76b);
    }

    updateDemolishHover(clientX, clientY) {
        const cell = this.cellAtClient(clientX, clientY);
        if (!cell) { this.hoverGraphics.clear(); return; }
        const hasBuilding = state.grid[cell.row][cell.col] !== null;
        if (hasBuilding) {
            this.drawHoverRect(cell, 0xd95a5a, 0.25, 1);
        } else {
            this.drawHoverRect(cell, 0x666666, 0.05, 0.4);
        }
    }

    clearHover() {
        this.hoverGraphics.clear();
    }

    renderBuilding(building) {
        const { row, col, type } = building;
        const x = this.boardOffsetX + col * CELL_SIZE;
        const y = this.boardOffsetY + row * CELL_SIZE;
        const inset = 4;
        const w = CELL_SIZE - inset * 2;
        const h = CELL_SIZE - inset * 2;
        const cx = x + CELL_SIZE / 2;
        const cy = y + CELL_SIZE / 2;

        const g = this.add.graphics();
        g.fillStyle(type.color, 1);
        g.lineStyle(1, 0x000000, 0.3);

        switch (type.shape) {
            case 'roof': {
                g.fillRect(x + inset, cy - 2, w, h / 2 + 2);
                g.strokeRect(x + inset, cy - 2, w, h / 2 + 2);
                g.fillTriangle(
                    x + inset, cy - 2,
                    cx, y + inset,
                    x + inset + w, cy - 2
                );
                g.strokeTriangle(
                    x + inset, cy - 2,
                    cx, y + inset,
                    x + inset + w, cy - 2
                );
                break;
            }
            case 'tower': {
                g.fillRect(cx - w * 0.25, y + inset, w * 0.5, h);
                g.strokeRect(cx - w * 0.25, y + inset, w * 0.5, h);
                g.fillStyle(0x8a3a3a, 1);
                g.fillTriangle(
                    cx - w * 0.3, y + inset,
                    cx, y + inset - 6,
                    cx + w * 0.3, y + inset
                );
                break;
            }
            default:
                g.fillRect(x + inset, y + inset, w, h);
                g.strokeRect(x + inset, y + inset, w, h);
                break;
        }

        this.buildingLayer.add(g);
        building.graphic = g;
    }

    renderCitizen(citizen) {
        const dot = this.add.circle(
            this.boardOffsetX + citizen.x,
            this.boardOffsetY + citizen.y,
            CITIZEN_RADIUS,
            CITIZEN_COLOR
        );
        dot.setStrokeStyle(1, 0x000000, 0.5);
        this.citizenLayer.add(dot);
        citizen.graphic = dot;
    }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: BOARD_PIXELS,
    height: BOARD_PIXELS,
    backgroundColor: '#0f1218',
    scene: BoardScene,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
};

buildShop();
updateCurrencyDisplay();
new Phaser.Game(config);
