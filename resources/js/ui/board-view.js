/**
 * Accessibility and UI helpers for Tic Tac Toe board
 */

export function getCellCoordinates(index) {
    const row = Math.floor(index / 3) + 1;
    const col = (index % 3) + 1;
    return { row, col };
}

export function getCellAriaLabel(index, value, isWinning) {
    const { row, col } = getCellCoordinates(index);
    let label = `Row ${row}, Column ${col}, ${value ? value : 'empty'}`;
    if (isWinning) {
        label += ', winning cell';
    }
    return label;
}

export class BoardView {
    constructor({ boardElement, announcementElement, statusElement, onCellClick }) {
        this.boardElement = boardElement;
        this.announcementElement = announcementElement;
        this.statusElement = statusElement;
        this.onCellClick = onCellClick || (() => {});
        this.lastAnnouncement = '';

        this.initEventListeners();
    }

    initEventListeners() {
        this.boardElement.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-index]');
            if (!button || button.disabled) return;

            const index = parseInt(button.dataset.index, 10);
            if (!Number.isNaN(index)) {
                this.onCellClick(index);
            }
        });
    }

    render(state, options = {}) {
        const {
            locked = false,
            yourSymbol = null,
            mode = 'local',
            opponentName = 'Opponent',
        } = options;

        const cells = this.boardElement.querySelectorAll('.cell');
        const winningSet = new Set(state.winningIndices || []);

        cells.forEach((cell, idx) => {
            const value = state.board[idx];
            const isWinning = winningSet.has(idx);

            // Update cell visual classes
            cell.classList.toggle('cell--x', value === 'X');
            cell.classList.toggle('cell--o', value === 'O');
            cell.classList.toggle('cell--winning', isWinning);

            // Update inner symbol markup with distinct shapes
            cell.innerHTML = this.renderSymbolMarkup(value, isWinning);

            // Accessibility attributes
            cell.setAttribute('aria-label', getCellAriaLabel(idx, value, isWinning));

            // Cell disabled state
            const isFinished = state.status !== 'in_progress';
            const isOccupied = value !== null;
            const notYourTurn = yourSymbol !== null && state.currentTurn !== yourSymbol;

            cell.disabled = locked || isFinished || isOccupied || notYourTurn;
        });

        this.updateStatus(state, { mode, yourSymbol, opponentName, locked });
    }

    renderSymbolMarkup(value, isWinning) {
        if (!value) {
            return '<span class="cell__empty" aria-hidden="true"></span>';
        }

        const winBadge = isWinning ? '<span class="cell__star" aria-hidden="true">★</span>' : '';

        if (value === 'X') {
            return `
                <svg class="symbol symbol--x" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                    <line x1="10" y1="10" x2="38" y2="38" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
                    <line x1="38" y1="10" x2="10" y2="38" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
                </svg>
                ${winBadge}
            `;
        }

        if (value === 'O') {
            return `
                <svg class="symbol symbol--o" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                    <circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" stroke-width="6"/>
                </svg>
                ${winBadge}
            `;
        }

        return '';
    }

    updateStatus(state, { mode, yourSymbol, opponentName, locked }) {
        let text = '';
        let badgeType = 'info';

        if (state.status === 'waiting') {
            text = 'Waiting for opponent to join...';
            badgeType = 'waiting';
        } else if (state.status === 'won') {
            if (mode === 'online' && yourSymbol) {
                text = state.winner === yourSymbol ? 'You won! 🎉' : 'Opponent won!';
                badgeType = state.winner === yourSymbol ? 'success' : 'alert';
            } else if (mode === 'computer') {
                text = state.winner === 'X' ? 'You won! 🎉' : 'Computer won!';
                badgeType = state.winner === 'X' ? 'success' : 'alert';
            } else {
                text = `Player ${state.winner} won! 🎉`;
                badgeType = 'success';
            }
        } else if (state.status === 'draw') {
            text = "Game ended in a draw! 🤝";
            badgeType = 'draw';
        } else {
            // In progress
            if (locked) {
                text = mode === 'computer' ? 'Computer is thinking...' : 'Processing move...';
                badgeType = 'thinking';
            } else if (mode === 'online' && yourSymbol) {
                text = state.currentTurn === yourSymbol ? 'Your turn!' : `${opponentName}'s turn`;
                badgeType = state.currentTurn === yourSymbol ? 'active-turn' : 'waiting';
            } else if (mode === 'computer') {
                text = state.currentTurn === 'X' ? 'Your turn (X)' : 'Computer turn (O)';
                badgeType = state.currentTurn === 'X' ? 'active-turn' : 'waiting';
            } else {
                text = `Player ${state.currentTurn}'s turn`;
                badgeType = 'active-turn';
            }
        }

        if (this.statusElement) {
            this.statusElement.textContent = text;
            this.statusElement.className = `status-badge status-badge--${badgeType}`;
        }

        this.announce(text);
    }

    announce(message) {
        if (!message || message === this.lastAnnouncement) return;
        this.lastAnnouncement = message;

        if (this.announcementElement) {
            this.announcementElement.textContent = message;
        }
    }
}
