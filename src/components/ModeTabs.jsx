import React from 'react';

const TABS = [
    { id: 'solo', label: 'Solo', controls: 'game-panel' },
    { id: 'online', label: 'Online Co-op', controls: 'game-panel' },
    { id: 'watch', label: 'Watch Live', controls: 'watch-directory' },
];

export function ModeTabs({ mode, onSelectMode }) {
    return (
        <nav aria-label="Game Modes">
            <div className="mode-tabs" role="tablist">
                {TABS.map((tab) => {
                    const isActive = mode === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            id={`tab-${tab.id}`}
                            aria-selected={isActive}
                            aria-controls={tab.controls}
                            className={`mode-tab ${isActive ? 'mode-tab--active' : ''}`}
                            data-mode-btn={tab.id}
                            onClick={() => onSelectMode(tab.id)}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
