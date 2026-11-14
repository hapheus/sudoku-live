import React from 'react';
import enMessages from '../locales/en.json';

export function SettingsPanel({
    theme,
    language,
    musicEnabled = true,
    musicVolume = 0.45,
    soundEnabled = true,
    soundVolume = 0.65,
    onChangeTheme,
    onChangeLanguage,
    onChangeMusicEnabled = () => {},
    onChangeMusicVolume = () => {},
    onChangeSoundEnabled = () => {},
    onChangeSoundVolume = () => {},
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

    const musicOptions = [
        { value: true, label: messages.musicOn || 'On' },
        { value: false, label: messages.musicOff || 'Off' },
    ];

    const soundOptions = [
        { value: true, label: messages.soundOn || 'On' },
        { value: false, label: messages.soundOff || 'Off' },
    ];

    const musicPercent = Math.round(Math.min(1, Math.max(0, Number(musicVolume) || 0)) * 100);
    const soundPercent = Math.round(Math.min(1, Math.max(0, Number(soundVolume) || 0)) * 100);

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

            <div className="settings-group">
                <fieldset className="settings-fieldset">
                    <legend className="settings-fieldset__legend">{messages.settingsMusic || 'Background Music'}</legend>
                    <div className="segmented-options segmented-options--2" role="radiogroup" aria-label={messages.settingsMusic || 'Background Music'}>
                        {musicOptions.map((opt) => {
                            const active = Boolean(musicEnabled) === opt.value;
                            return (
                                <label
                                    key={String(opt.value)}
                                    className={`segmented-label ${active ? 'segmented-label--active' : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="sudoku-music"
                                        value={String(opt.value)}
                                        checked={active}
                                        onChange={() => onChangeMusicEnabled(opt.value)}
                                    />
                                    <span>{opt.label}</span>
                                </label>
                            );
                        })}
                    </div>
                    <div className={`settings-volume-row ${!musicEnabled ? 'settings-volume-row--disabled' : ''}`}>
                        <label htmlFor="sudoku-music-volume" className="settings-volume-row__label">
                            {messages.volumeLabel || 'Volume'}
                        </label>
                        <input
                            id="sudoku-music-volume"
                            type="range"
                            className="settings-volume-row__slider"
                            min={0}
                            max={100}
                            step={5}
                            value={musicPercent}
                            disabled={!musicEnabled}
                            aria-label={messages.musicVolumeLabel || 'Volume: Background Music'}
                            onChange={(e) => onChangeMusicVolume(Number(e.target.value) / 100)}
                        />
                        <span className="settings-volume-row__value">{`${musicPercent}%`}</span>
                    </div>
                </fieldset>
            </div>

            <div className="settings-group">
                <fieldset className="settings-fieldset">
                    <legend className="settings-fieldset__legend">{messages.settingsSounds || 'Sound Effects'}</legend>
                    <div className="segmented-options segmented-options--2" role="radiogroup" aria-label={messages.settingsSounds || 'Sound Effects'}>
                        {soundOptions.map((opt) => {
                            const active = Boolean(soundEnabled) === opt.value;
                            return (
                                <label
                                    key={String(opt.value)}
                                    className={`segmented-label ${active ? 'segmented-label--active' : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="sudoku-sounds"
                                        value={String(opt.value)}
                                        checked={active}
                                        onChange={() => onChangeSoundEnabled(opt.value)}
                                    />
                                    <span>{opt.label}</span>
                                </label>
                            );
                        })}
                    </div>
                    <div className={`settings-volume-row ${!soundEnabled ? 'settings-volume-row--disabled' : ''}`}>
                        <label htmlFor="sudoku-sound-volume" className="settings-volume-row__label">
                            {messages.volumeLabel || 'Volume'}
                        </label>
                        <input
                            id="sudoku-sound-volume"
                            type="range"
                            className="settings-volume-row__slider"
                            min={0}
                            max={100}
                            step={5}
                            value={soundPercent}
                            disabled={!soundEnabled}
                            aria-label={messages.soundVolumeLabel || 'Volume: Sound Effects'}
                            onChange={(e) => onChangeSoundVolume(Number(e.target.value) / 100)}
                        />
                        <span className="settings-volume-row__value">{`${soundPercent}%`}</span>
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
