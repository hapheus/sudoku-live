import { getCellCoords } from '../domain/sudoku-generator.js';
import { getDigitCounts } from '../domain/sudoku-engine.js';

export function getSudokuCellAriaLabel(index, value, {
    isGiven = false,
    isConflict = false,
    notes = [],
    hint = null,
} = {}) {
    const { row, col } = getCellCoords(index);
    const parts = [`Row ${row + 1}, Column ${col + 1}`];

    if (value >= 1 && value <= 9) {
        parts.push(isGiven ? `given ${value}` : `${value}`);
    } else {
        parts.push('empty');
        if (notes && notes.length > 0) {
            parts.push(`notes ${notes.join(', ')}`);
        }
    }

    if (isConflict) {
        parts.push('conflict');
    }

    if (hint && hint.topValue) {
        parts.push(`spectator hint ${hint.topValue}`);
    } else if (hint) {
        parts.push('spectator nudge');
    }

    return parts.join(', ');
}

export class SudokuBoardView {
    constructor({
        boardElement,
        announcementElement,
        statusElement,
        progressElement,
        padButtons,
        onCellSelect,
    }) {
        this.boardElement = boardElement;
        this.announcementElement = announcementElement;
        this.statusElement = statusElement;
        this.progressElement = progressElement;
        this.padButtons = padButtons || [];
        this.onCellSelect = onCellSelect || (() => {});
        this.lastAnnouncement = '';
        this.cells = [];

        this.buildGrid();
        this.initEventListeners();
    }

    buildGrid() {
        if (!this.boardElement) return;
        this.boardElement.replaceChildren();
        this.cells = [];

        for (let r = 0; r < 9; r++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'sudoku-row';
            rowEl.setAttribute('role', 'row');

            for (let c = 0; c < 9; c++) {
                const index = r * 9 + c;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'sudoku-cell';
                btn.setAttribute('role', 'gridcell');
                btn.dataset.index = String(index);

                if (c === 2 || c === 5) btn.classList.add('sudoku-cell--box-right');
                if (r === 2 || r === 5) btn.classList.add('sudoku-cell--box-bottom');

                rowEl.appendChild(btn);
                this.cells.push(btn);
            }

            this.boardElement.appendChild(rowEl);
        }
    }

    initEventListeners() {
        if (!this.boardElement) return;

        this.boardElement.addEventListener('click', (e) => {
            const cell = e.target.closest('button[data-index]');
            if (!cell) return;
            const index = parseInt(cell.dataset.index, 10);
            if (!Number.isNaN(index)) {
                this.onCellSelect(index);
            }
        });
    }

    focusCell(index) {
        const cell = this.cells[index];
        if (cell) cell.focus();
    }

    render(state, {
        selectedIndex = null,
        isSpectating = false,
        mode = 'solo',
        hintsByCell = new Map(),
    } = {}) {
        const selectedCoords = selectedIndex !== null ? getCellCoords(selectedIndex) : null;
        const selectedValue = selectedIndex !== null ? state.board[selectedIndex] : 0;
        const conflictSet = new Set(state.conflicts || []);

        this.cells.forEach((cell, idx) => {
            const value = state.board[idx];
            const isGiven = Boolean(state.givens[idx]);
            const isSelected = idx === selectedIndex;
            const isConflict = conflictSet.has(idx);
            const cellNotes = state.notes[idx] || [];
            const coords = getCellCoords(idx);
            const hint = value === 0 ? (hintsByCell.get(idx) || null) : null;

            const isPeer = selectedCoords !== null && !isSelected && (
                coords.row === selectedCoords.row
                || coords.col === selectedCoords.col
                || coords.box === selectedCoords.box
            );
            const isSameDigit = selectedValue > 0 && value === selectedValue && !isSelected;

            cell.classList.toggle('sudoku-cell--given', isGiven);
            cell.classList.toggle('sudoku-cell--user', !isGiven && value > 0);
            cell.classList.toggle('sudoku-cell--selected', isSelected);
            cell.classList.toggle('sudoku-cell--peer', isPeer);
            cell.classList.toggle('sudoku-cell--same-digit', isSameDigit);
            cell.classList.toggle('sudoku-cell--conflict', isConflict);
            cell.classList.toggle('sudoku-cell--hinted', Boolean(hint));

            if (isConflict) {
                cell.setAttribute('aria-invalid', 'true');
            } else {
                cell.removeAttribute('aria-invalid');
            }

            cell.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            cell.setAttribute('aria-label', getSudokuCellAriaLabel(idx, value, {
                isGiven,
                isConflict,
                notes: cellNotes,
                hint,
            }));

            // Render cell content safely
            cell.replaceChildren();

            if (value >= 1 && value <= 9) {
                const digitSpan = document.createElement('span');
                digitSpan.className = 'sudoku-cell__digit';
                digitSpan.textContent = String(value);
                cell.appendChild(digitSpan);
            } else {
                if (cellNotes.length > 0) {
                    const notesGrid = document.createElement('span');
                    notesGrid.className = 'sudoku-cell__notes';
                    notesGrid.setAttribute('aria-hidden', 'true');
                    for (let d = 1; d <= 9; d++) {
                        const noteSlot = document.createElement('span');
                        noteSlot.className = 'sudoku-cell__note';
                        noteSlot.textContent = cellNotes.includes(d) ? String(d) : '';
                        notesGrid.appendChild(noteSlot);
                    }
                    cell.appendChild(notesGrid);
                }

                if (hint) {
                    const badge = document.createElement('span');
                    badge.className = 'sudoku-cell__hint-badge';
                    badge.setAttribute('aria-hidden', 'true');
                    badge.textContent = hint.topValue ? String(hint.topValue) : '?';
                    cell.appendChild(badge);
                }
            }
        });

        // Update progress & number pad remaining counts
        if (this.progressElement) {
            this.progressElement.textContent = `${state.filledCount}/81`;
        }

        const counts = getDigitCounts(state.board);
        this.padButtons.forEach((btn) => {
            const digit = parseInt(btn.dataset.digit, 10);
            if (!Number.isNaN(digit) && digit >= 1 && digit <= 9) {
                const remaining = Math.max(0, 9 - (counts[digit] || 0));
                const countEl = btn.querySelector('.numpad-btn__count');
                if (countEl) {
                    countEl.textContent = remaining > 0 ? String(remaining) : '';
                }
                btn.classList.toggle('numpad-btn--complete', remaining === 0);
            }
        });

        this.updateStatus(state, { isSpectating, mode });
    }

    updateStatus(state, { isSpectating, mode }) {
        if (!this.statusElement) return;

        let text = '';
        let badgeType = 'active-turn';
        const diffLabel = state.difficulty
            ? state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1)
            : 'Medium';

        if (state.status === 'solved') {
            text = mode === 'online' || isSpectating
                ? `Puzzle solved! (${diffLabel})`
                : `Solved! (${diffLabel})`;
            badgeType = 'success';
        } else if (state.conflicts && state.conflicts.length > 0) {
            text = `${diffLabel} — ${state.conflicts.length} conflicting cell${state.conflicts.length === 1 ? '' : 's'}`;
            badgeType = 'alert';
        } else if (isSpectating) {
            text = `Watching Live (${diffLabel}) — ${state.filledCount}/81 filled`;
            badgeType = 'waiting';
        } else if (mode === 'online') {
            text = `Co-op (${diffLabel}) — ${state.filledCount}/81 filled`;
            badgeType = 'active-turn';
        } else {
            text = `${diffLabel} — ${state.filledCount}/81 filled`;
            badgeType = 'active-turn';
        }

        this.statusElement.textContent = text;
        this.statusElement.className = `status-badge status-badge--${badgeType}`;
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
