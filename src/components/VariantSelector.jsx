import React from 'react';

const VARIANTS = [
    { value: '3x3', label: '3×3 (9×9)' },
    { value: '2x3', label: '2×3 (6×6)' },
];

export function VariantSelector({ variant, onChange }) {
    return (
        <fieldset id="variant-group" className="variant-group">
            <legend className="sr-only">Grid Size</legend>
            <div className="variant-options">
                {VARIANTS.map((item) => {
                    const isChecked = variant === item.value;
                    return (
                        <label
                            key={item.value}
                            className={`variant-label ${isChecked ? 'variant-label--active' : ''}`}
                        >
                            <input
                                type="radio"
                                name="sudoku-variant"
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
