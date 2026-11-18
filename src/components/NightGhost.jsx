import React from 'react';
import { ghostSwapGroups } from '../domain/night-ghost.js';
import './night-ghost.css';

function GhostSlab({ game, spec, axis, source, destination, size, color }) {
    const band = axis === 'band';
    const rows = band ? size : spec.gridSize;
    const cols = band ? spec.gridSize : size;
    const origin = (100 * source * size) / spec.gridSize;
    const distance = (destination - source) * 100;
    const arc = color === 'mint' ? '-25%' : '25%';
    const style = {
        '--slab-top': band ? `${origin}%` : '0%',
        '--slab-left': band ? '0%' : `${origin}%`,
        '--slab-width': `${100 * cols / spec.gridSize}%`,
        '--slab-height': `${100 * rows / spec.gridSize}%`,
        '--slab-x': band ? '0%' : `${distance}%`,
        '--slab-y': band ? `${distance}%` : '0%',
        '--slab-arc-x': band ? arc : '0%',
        '--slab-arc-y': band ? '0%' : arc,
        '--slab-rows': rows,
        '--slab-cols': cols,
    };

    return (
        <div className={`night-ghost-slab night-ghost-slab--${color}`} style={style}>
            {Array.from({ length: rows * cols }, (_, cell) => {
                const row = Math.floor(cell / cols) + (band ? destination * size : 0);
                const col = cell % cols + (band ? 0 : destination * size);
                const index = row * spec.gridSize + col;
                return (
                    <span
                        key={cell}
                        className="night-ghost-slab__cell"
                        data-given={game.givens[index]}
                        data-box-right={(col + 1) % spec.boxCols === 0 && cell % cols !== cols - 1}
                        data-box-bottom={(row + 1) % spec.boxRows === 0 && cell < cols * (rows - 1)}
                    >
                        {game.board[index] || (
                            <small className="night-ghost-slab__notes">{game.notes[index].join(' ')}</small>
                        )}
                    </span>
                );
            })}
        </div>
    );
}

export function NightGhost({ appearance, spec }) {
    const { swap, game, phase } = appearance;
    const { size, from, to } = ghostSwapGroups(swap, spec);
    return (
        <div className="night-ghost" data-phase={phase} aria-hidden="true">
            <GhostSlab game={game} spec={spec} axis={swap.axis} source={from} destination={to} size={size} color="mint" />
            <GhostSlab game={game} spec={spec} axis={swap.axis} source={to} destination={from} size={size} color="lilac" />
            <div className="night-ghost__flight">
                <div className="night-ghost__spirit">
                    <i className="night-ghost__spark night-ghost__spark--first" />
                    <i className="night-ghost__spark night-ghost__spark--second" />
                    <div className="night-ghost__body">
                        <span className="night-ghost__eyes" />
                        <span className="night-ghost__mouth" />
                    </div>
                </div>
            </div>
        </div>
    );
}
