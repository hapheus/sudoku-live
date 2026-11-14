import React from 'react';
import enMessages from '../locales/en.json';

export function VariantSelector({ variant, onChange, messages = enMessages }) {
    const variants = [
        { value: '2x3', label: messages.variant2x3 },
        { value: '3x3', label: messages.variant3x3 },
    ];

    return (
        <fieldset id="variant-group" className="variant-group">
            <legend className="variant-group__legend">{messages.variantLegend}</legend>
            <div className="variant-options">
                {variants.map((item) => {
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
