import React, { useLayoutEffect, useRef, useState } from 'react';

export function SpectatorBackButton({ label, shortLabel, onClick }) {
    const labelBox = useRef(null);
    const fullLabel = useRef(null);
    const [compact, setCompact] = useState(false);

    useLayoutEffect(() => {
        if (!window.ResizeObserver) return undefined;
        const box = labelBox.current;
        const full = fullLabel.current;
        const observer = new window.ResizeObserver(() => {
            setCompact(full.getBoundingClientRect().width > box.getBoundingClientRect().width);
        });
        observer.observe(box);
        observer.observe(full);
        return () => observer.disconnect();
    }, []);

    return (
        <button
            type="button"
            id="exit-watch-btn"
            className="spectator-bar__back-btn spectator-bar__back-btn--exit"
            title={label}
            onClick={onClick}
        >
            <span className="spectator-bar__back-labels" ref={labelBox}>
                <span ref={fullLabel} aria-hidden={compact}>
                    {label}
                </span>
                <span aria-hidden={!compact}>
                    {shortLabel}
                </span>
            </span>
        </button>
    );
}
