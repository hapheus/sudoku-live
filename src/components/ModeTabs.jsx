import React, { useRef } from 'react';

const TABS = [
    { id: 'solo', label: 'Solo', controls: 'game-panel' },
    { id: 'online', label: 'Online Co-op', controls: 'game-panel' },
    { id: 'watch', label: 'Watch Live', controls: 'watch-directory' },
];

export function ModeTabs({ mode, onSelectMode }) {
    const tabRefs = useRef([]);

    const handleKeyDown = (e, currentIndex) => {
        let nextIndex = null;
        if (e.key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % TABS.length;
        } else if (e.key === 'ArrowLeft') {
            nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        } else if (e.key === 'Home') {
            nextIndex = 0;
        } else if (e.key === 'End') {
            nextIndex = TABS.length - 1;
        }

        if (nextIndex !== null) {
            e.preventDefault();
            const targetTab = TABS[nextIndex];
            onSelectMode(targetTab.id);
            tabRefs.current[nextIndex]?.focus();
        }
    };

    return (
        <nav aria-label="Game Modes">
            <div className="mode-tabs" role="tablist">
                {TABS.map((tab, index) => {
                    const isActive = mode === tab.id;
                    return (
                        <button
                            key={tab.id}
                            ref={(el) => {
                                tabRefs.current[index] = el;
                            }}
                            type="button"
                            role="tab"
                            id={`tab-${tab.id}`}
                            aria-selected={isActive}
                            aria-controls={tab.controls}
                            tabIndex={isActive ? 0 : -1}
                            className={`mode-tab ${isActive ? 'mode-tab--active' : ''}`}
                            data-mode-btn={tab.id}
                            onClick={() => onSelectMode(tab.id)}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
