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
            <legend className="sr-only">Difficulty</legend>
            <div className="difficulty-options">
                {DIFFICULTIES.map((item) => {
                    const isChecked = difficulty === item.value;
                    return (
                        <label
                            key={item.value}
                            className={`difficulty-label ${isChecked ? 'difficulty-label--active' : ''}`}
                        >
                            <input
                                type="radio"
                                name="sudoku-difficulty"
                                value={item.value}
                                checked={isChecked}
                                onChange={() => onChange(item.value)}
                            />
                            <span>{item.label}</span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}
