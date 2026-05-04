import { BOARD_PIXELS_INNER, CITIZEN_RADIUS } from './constants.js';

// Starter name pool — expand later.
export const CITIZEN_NAMES = ['Aria', 'Bram', 'Cora', 'Davin', 'Elin'];

export function randomCitizenName() {
    return CITIZEN_NAMES[Math.floor(Math.random() * CITIZEN_NAMES.length)];
}

// A free-moving worker unit. Position is in board-relative pixel coordinates
// so the citizen is decoupled from where the board is rendered on screen.
// Wanders by picking a random target, walking to it, dwelling briefly, repeat.
export class Citizen {
    constructor({ id, x, y, name, birthCell }) {
        this.id = id;
        this.name = name;
        this.birthCell = birthCell;     // { row, col } — never changes
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
