import React from 'react';

const DIFFICULTIES = [
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' },
    { value: 'expert', label: 'Expert' },
];

export function DifficultySelector({ difficulty, onChange }) {
    return (
        <fieldset id="difficulty-group" className="difficulty-group">
            <legend>Difficulty</legend>
            <div className="difficulty-options">
                {DIFFICULTIES.map((item) => (
                    <label key={item.value} className="difficulty-label">
                        <input
                            type="radio"
                            name="sudoku-difficulty"
                            value={item.value}
                            checked={difficulty === item.value}
                            onChange={() => onChange(item.value)}
                        />
                        <span>{item.label}</span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
