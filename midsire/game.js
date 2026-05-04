const GRID_SIZE = 11;
const CELL_SIZE = 56;
const GRID_PADDING = 24;
const BOARD_PIXELS = GRID_SIZE * CELL_SIZE + GRID_PADDING * 2;

const TILE_TYPES = [
    { id: 'grass',   name: 'Grass',   cost: 10,   color: 0x6abf69, shape: 'square' },
    { id: 'house',   name: 'House',   cost: 100,  color: 0xc97b5a, shape: 'roof' },
    { id: 'farm',    name: 'Farm',    cost: 250,  color: 0xe6c84d, shape: 'stripes' },
    { id: 'tree',    name: 'Tree',    cost: 50,   color: 0x2f7a3a, shape: 'circle' },
    { id: 'water',   name: 'Water',   cost: 30,   color: 0x4a90d9, shape: 'square' },
    { id: 'road',    name: 'Road',    cost: 20,   color: 0x6a6a6a, shape: 'square' },
    { id: 'market',  name: 'Market',  cost: 500,  color: 0xb064c9, shape: 'roof' },
    { id: 'tower',   name: 'Tower',   cost: 1500, color: 0xd9d9d9, shape: 'tower' },
];

const state = {
    currency: 1_000_000,
    grid: Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null)),
    drag: null,
};

const tileById = Object.fromEntries(TILE_TYPES.map(t => [t.id, t]));

const currencyEl = document.getElementById('currency-amount');
const shopItemsEl = document.getElementById('shop-items');

function formatCurrency(n) {
    return n.toLocaleString();
}

function colorToCss(int) {
    return '#' + int.toString(16).padStart(6, '0');
}

function updateCurrencyDisplay() {
    currencyEl.textContent = formatCurrency(state.currency);
    document.querySelectorAll('.shop-item').forEach(el => {
        const cost = Number(el.dataset.cost);
        el.classList.toggle('unaffordable', state.currency < cost);
    });
}

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

const ghostEl = document.createElement('div');
ghostEl.id = 'drag-ghost';
document.body.appendChild(ghostEl);

function startDrag(e, tile) {
    if (state.currency < tile.cost) return;
    e.preventDefault();
    state.drag = { tile, pointerId: e.pointerId };
    ghostEl.style.background = colorToCss(tile.color);
    ghostEl.style.display = 'block';
    moveGhost(e.clientX, e.clientY);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
}

function moveGhost(x, y) {
    ghostEl.style.left = x + 'px';
    ghostEl.style.top = y + 'px';
}

function onPointerMove(e) {
    if (!state.drag) return;
    moveGhost(e.clientX, e.clientY);
    if (gameScene) gameScene.updateHover(e.clientX, e.clientY);
}

function onPointerUp(e) {
    if (!state.drag) return;
    const cell = gameScene ? gameScene.cellAtClient(e.clientX, e.clientY) : null;
    if (cell && state.grid[cell.row][cell.col] === null) {
        const tile = state.drag.tile;
        if (state.currency >= tile.cost) {
            state.currency -= tile.cost;
            state.grid[cell.row][cell.col] = tile.id;
            gameScene.placeTile(cell.row, cell.col, tile);
            updateCurrencyDisplay();
        }
    }
    cancelDrag();
}

function cancelDrag() {
    state.drag = null;
    ghostEl.style.display = 'none';
    if (gameScene) gameScene.clearHover();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
}

let gameScene = null;

class BoardScene extends Phaser.Scene {
    constructor() {
        super('BoardScene');
        this.tileGraphics = {};
        this.hoverCell = null;
    }

    create() {
        gameScene = this;
        this.cameras.main.setBackgroundColor('#0f1218');

        this.boardOffsetX = GRID_PADDING;
        this.boardOffsetY = GRID_PADDING;

        const boardBg = this.add.rectangle(
            this.boardOffsetX - 6,
            this.boardOffsetY - 6,
            GRID_SIZE * CELL_SIZE + 12,
            GRID_SIZE * CELL_SIZE + 12,
            0x1c2029
        ).setOrigin(0, 0).setStrokeStyle(1, 0x2a2f3a);

        this.gridGraphics = this.add.graphics();
        this.drawGrid();

        this.hoverGraphics = this.add.graphics();
        this.tileLayer = this.add.container(0, 0);
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

    updateHover(clientX, clientY) {
        const cell = this.cellAtClient(clientX, clientY);
        this.hoverCell = cell;
        const g = this.hoverGraphics;
        g.clear();
        if (!cell) return;
        const x = this.boardOffsetX + cell.col * CELL_SIZE;
        const y = this.boardOffsetY + cell.row * CELL_SIZE;
        const occupied = state.grid[cell.row][cell.col] !== null;
        const color = occupied ? 0xd95a5a : 0xffd76b;
        g.lineStyle(3, color, 1);
        g.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        g.fillStyle(color, 0.15);
        g.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }

    clearHover() {
        this.hoverCell = null;
        this.hoverGraphics.clear();
    }

    placeTile(row, col, tile) {
        const x = this.boardOffsetX + col * CELL_SIZE;
        const y = this.boardOffsetY + row * CELL_SIZE;
        const inset = 4;
        const w = CELL_SIZE - inset * 2;
        const h = CELL_SIZE - inset * 2;
        const cx = x + CELL_SIZE / 2;
        const cy = y + CELL_SIZE / 2;

        const g = this.add.graphics();
        g.fillStyle(tile.color, 1);
        g.lineStyle(1, 0x000000, 0.3);

        switch (tile.shape) {
            case 'circle':
                g.fillCircle(cx, cy, w / 2);
                g.strokeCircle(cx, cy, w / 2);
                break;
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
            case 'stripes': {
                g.fillRect(x + inset, y + inset, w, h);
                g.strokeRect(x + inset, y + inset, w, h);
                g.lineStyle(2, 0x8a6a1f, 0.7);
                const stripes = 4;
                for (let i = 1; i < stripes; i++) {
                    const sy = y + inset + (h / stripes) * i;
                    g.lineBetween(x + inset + 2, sy, x + inset + w - 2, sy);
                }
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
            case 'square':
            default:
                g.fillRect(x + inset, y + inset, w, h);
                g.strokeRect(x + inset, y + inset, w, h);
                break;
        }

        this.tileLayer.add(g);
        this.tileGraphics[`${row},${col}`] = g;
    }
}

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
