import React from 'react';
import enMessages from '../locales/en.json';

export function SettingsPanel({
    theme,
    language,
    onChangeTheme,
    onChangeLanguage,
    onOpenGuide,
    messages = enMessages,
}) {
    const themeOptions = [
        { value: 'dark', label: messages.themeDark },
        { value: 'light', label: messages.themeLight },
    ];

    const langOptions = [
        { value: 'en', label: messages.langEn },
        { value: 'de', label: messages.langDe },
    ];

    return (
        <section id="settings-panel" className="settings-panel" aria-label={messages.settingsTitle}>
            <header className="settings-panel__header">
                <h2 className="settings-panel__title">{messages.settingsTitle}</h2>
            </header>

            <div className="settings-group">
                <fieldset className="settings-fieldset">
                    <legend className="settings-fieldset__legend">{messages.settingsTheme}</legend>
                    <div className="segmented-options segmented-options--2" role="radiogroup" aria-label={messages.settingsTheme}>
                        {themeOptions.map((opt) => {
                            const active = theme === opt.value;
                            return (
                                <label
                                    key={opt.value}
                                    className={`segmented-label ${active ? 'segmented-label--active' : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="sudoku-theme"
                                        value={opt.value}
                                        checked={active}
                                        onChange={() => onChangeTheme(opt.value)}
                                    />
                                    <span>{opt.label}</span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
            </div>

            <div className="settings-group">
                <fieldset className="settings-fieldset">
                    <legend className="settings-fieldset__legend">{messages.settingsLanguage}</legend>
                    <div className="segmented-options segmented-options--2" role="radiogroup" aria-label={messages.settingsLanguage}>
                        {langOptions.map((opt) => {
                            const active = language === opt.value;
                            return (
                                <label
                                    key={opt.value}
                                    className={`segmented-label ${active ? 'segmented-label--active' : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="sudoku-language"
                                        value={opt.value}
                                        checked={active}
                                        onChange={() => onChangeLanguage(opt.value)}
                                    />
                                    <span>{opt.label}</span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
            </div>

            <div className="settings-group settings-guide-row">
                <div className="settings-guide-row__copy">
                    <h3 className="settings-guide-row__title">{messages.settingsGuideTitle}</h3>
                    <p className="settings-guide-row__desc">{messages.settingsGuideDesc}</p>
                </div>
                <button
                    type="button"
                    id="settings-guide-btn"
                    className="btn-secondary"
                    onClick={onOpenGuide}
                >
                    {messages.openGuide}
                </button>
            </div>
        </section>
    );
}
