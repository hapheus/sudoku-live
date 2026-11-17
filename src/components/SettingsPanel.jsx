import React, { useEffect, useState } from 'react';
import enMessages from '../locales/en.json';
import { isValidPlayerName, MAX_PLAYER_NAME_LENGTH } from '../services/player-name.js';
import { PlayerTag } from './PlayerTag.jsx';
import {
    IconAudioLines,
    IconBookOpen,
    IconCheck,
    IconContrast,
    IconGlobe,
    IconHelpCircle,
    IconMoon,
    IconMusic,
    IconSun,
    IconUserCheck,
    IconUsers,
    IconVolume1,
    IconVolume2,
    IconVolumeX,
    IconX,
} from './AppIcons.jsx';

const ACTIVE_OPTION_CLASS = 'segmented-label--active';

export function SettingsPanel({
    theme,
    language,
    playerName = '',
    playerTag = '',
    joinsAllowed = true,
    joinsAutoAccept = false,
    musicEnabled = false,
    musicVolume = 0.45,
    soundEnabled = true,
    soundVolume = 0.65,
    onChangeTheme,
    onChangeLanguage,
    onChangePlayerName = () => {},
    onRandomizePlayerName = () => {},
    onChangeJoinsAllowed = () => {},
    onChangeJoinsAutoAccept = () => {},
    onChangeMusicEnabled = () => {},
    onChangeMusicVolume = () => {},
    onChangeSoundEnabled = () => {},
    onChangeSoundVolume = () => {},
    onOpenGuide,
    messages = enMessages,
}) {
    const [draftPlayerName, setDraftPlayerName] = useState(playerName || '');

    useEffect(() => {
        setDraftPlayerName(playerName || '');
    }, [playerName]);

    const isPlayerNameInvalid = draftPlayerName.length > 0 && !isValidPlayerName(draftPlayerName);
    const themeOptions = [
        { value: 'system', label: messages.themeSystem, Icon: IconContrast },
        { value: 'dark', label: messages.themeDark, Icon: IconMoon },
        { value: 'light', label: messages.themeLight, Icon: IconSun },
    ];

    const langOptions = [
        { value: 'en', label: messages.langEn },
        { value: 'de', label: messages.langDe },
    ];

    const musicOptions = [
        { value: true, label: messages.musicOn || 'On', Icon: IconVolume2 },
        { value: false, label: messages.musicOff || 'Off', Icon: IconVolumeX },
    ];

    const soundOptions = [
        { value: true, label: messages.soundOn || 'On', Icon: IconVolume2 },
        { value: false, label: messages.soundOff || 'Off', Icon: IconVolumeX },
    ];

    const joinOptions = [
        { value: true, label: messages.joinOptOn || 'On', Icon: IconCheck },
        { value: false, label: messages.joinOptOff || 'Off', Icon: IconX },
    ];

    const musicPercent = Math.round(Math.min(1, Math.max(0, Number(musicVolume) || 0)) * 100);
    const soundPercent = Math.round(Math.min(1, Math.max(0, Number(soundVolume) || 0)) * 100);

    return (
        <section id="settings-panel" className="settings-panel" aria-label={messages.settingsTitle}>
            <header className="settings-panel__header">
                <h2 className="settings-panel__title">{messages.settingsTitle}</h2>
            </header>

            <div className="settings-group">
                <div className="settings-fieldset settings-player-name">
                    <label htmlFor="player-name-input" className="settings-fieldset__legend">
                        <span className="settings-fieldset__legend-inner">
                            <IconUserCheck className="settings-icon settings-icon--legend" />
                            <span>{messages.settingsPlayerName || 'Player Name'}</span>
                        </span>
                    </label>
                    <div className="settings-player-name__row">
                        <input
                            id="player-name-input"
                            type="text"
                            className="settings-player-name__input"
                            value={draftPlayerName}
                            maxLength={MAX_PLAYER_NAME_LENGTH}
                            pattern="[A-Za-z0-9_\-]+"
                            placeholder={messages.playerNamePlaceholder || 'Enter your name'}
                            aria-invalid={isPlayerNameInvalid ? 'true' : undefined}
                            aria-describedby={isPlayerNameInvalid ? 'player-name-error player-name-hint' : 'player-name-hint'}
                            onChange={(e) => {
                                const raw = e.target.value;
                                setDraftPlayerName(raw);
                                if (isValidPlayerName(raw)) {
                                    onChangePlayerName(raw);
                                }
                            }}
                            onBlur={() => {
                                if (!isValidPlayerName(draftPlayerName)) {
                                    setDraftPlayerName(playerName || '');
                                }
                            }}
                        />
                        <button
                            type="button"
                            id="randomize-player-name-btn"
                            className="settings-player-name__randomize-btn"
                            aria-label={messages.playerNameRandomize || 'Randomize player name'}
                            onClick={() => onRandomizePlayerName()}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <path d="M3 3v5h5" />
                                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                                <path d="M16 16h5v5" />
                            </svg>
                        </button>
                    </div>
                    {isPlayerNameInvalid && (
                        <p id="player-name-error" className="settings-player-name__error" role="alert">
                            {messages.playerNameInvalid || 'Only letters, numbers, - and _ are allowed.'}
                        </p>
                    )}
                    <p id="player-name-hint" className="settings-player-name__hint">
                        {messages.playerNameHint || 'Shown to co-op partners and spectators. Duplicate names get a number suffix automatically.'}
                    </p>
                    {playerTag && (
                        <div className="settings-player-name__tag-row">
                            <span className="settings-player-name__tag-label">
                                {messages.playerTagLabel || 'Your Tag'}:
                            </span>
                            <code id="player-tag-display" className="settings-player-name__tag">
                                <PlayerTag tag={playerTag} />
                            </code>
                        </div>
                    )}
                </div>
            </div>

            <div className="settings-group settings-group--2col settings-group--preferences">
                <fieldset className="settings-fieldset">
                    <legend className="settings-fieldset__legend">
                        <span className="settings-fieldset__legend-inner">
                            <IconContrast className="settings-icon settings-icon--legend" />
                            <span>{messages.settingsTheme}</span>
                        </span>
                    </legend>
                    <div className="segmented-options segmented-options--3" role="radiogroup" aria-label={messages.settingsTheme}>
                        {themeOptions.map((opt) => {
                            const active = theme === opt.value;
                            const OptionIcon = opt.Icon;
                            return (
                                <label
                                    key={opt.value}
                                    className={`segmented-label ${active ? ACTIVE_OPTION_CLASS : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="sudoku-theme"
                                        value={opt.value}
                                        checked={active}
                                        onChange={() => onChangeTheme(opt.value)}
                                    />
                                    <OptionIcon className="settings-icon settings-icon--option" />
                                    <span>{opt.label}</span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>

                <fieldset className="settings-fieldset">
                    <legend className="settings-fieldset__legend">
                        <span className="settings-fieldset__legend-inner">
                            <IconGlobe className="settings-icon settings-icon--legend" />
                            <span>{messages.settingsLanguage}</span>
                        </span>
                    </legend>
                    <div className="segmented-options segmented-options--2" role="radiogroup" aria-label={messages.settingsLanguage}>
                        {langOptions.map((opt) => {
                            const active = language === opt.value;
                            return (
                                <label
                                    key={opt.value}
                                    className={`segmented-label ${active ? ACTIVE_OPTION_CLASS : ''}`}
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

            <div className="settings-group settings-group--2col">
                <fieldset className="settings-fieldset">
                    <legend className="settings-fieldset__legend">
                        <span className="settings-fieldset__legend-inner">
                            <IconUsers className="settings-icon settings-icon--legend" />
                            <span>{messages.settingsJoinsAllowed || 'Allow Joins'}</span>
                        </span>
                    </legend>
                    <div className="segmented-options segmented-options--2" role="radiogroup" aria-label={messages.settingsJoinsAllowed || 'Allow Joins'}>
                        {joinOptions.map((opt) => {
                            const active = Boolean(joinsAllowed) === opt.value;
                            const OptionIcon = opt.Icon;
                            return (
                                <label
                                    key={String(opt.value)}
                                    className={`segmented-label ${active ? ACTIVE_OPTION_CLASS : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="sudoku-joins-allowed"
                                        value={String(opt.value)}
                                        checked={active}
                                        onChange={() => onChangeJoinsAllowed(opt.value)}
                                    />
                                    <OptionIcon className="settings-icon settings-icon--option" />
                                    <span>{opt.label}</span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>

                <fieldset
                    className={`settings-fieldset settings-fieldset--sub ${!joinsAllowed ? 'settings-fieldset--disabled' : ''}`}
                    disabled={!joinsAllowed}
                >
                    <legend className="settings-fieldset__legend">
                        <span className="settings-fieldset__legend-inner">
                            <IconUserCheck className="settings-icon settings-icon--legend" />
                            <span>{messages.settingsJoinsAutoAccept || 'Auto-accept Joins'}</span>
                        </span>
                    </legend>
                    <div className="segmented-options segmented-options--2" role="radiogroup" aria-label={messages.settingsJoinsAutoAccept || 'Auto-accept Joins'}>
                        {joinOptions.map((opt) => {
                            const active = Boolean(joinsAutoAccept) === opt.value;
                            const OptionIcon = opt.Icon;
                            return (
                                <label
                                    key={String(opt.value)}
                                    className={`segmented-label ${active ? ACTIVE_OPTION_CLASS : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="sudoku-joins-auto"
                                        value={String(opt.value)}
                                        checked={active}
                                        disabled={!joinsAllowed}
                                        onChange={() => onChangeJoinsAutoAccept(opt.value)}
                                    />
                                    <OptionIcon className="settings-icon settings-icon--option" />
                                    <span>{opt.label}</span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
            </div>

            <div className="settings-group">
                <fieldset className="settings-fieldset">
                    <legend className="settings-fieldset__legend">
                        <span className="settings-fieldset__legend-inner">
                            <IconMusic className="settings-icon settings-icon--legend" />
                            <span>{messages.settingsMusic || 'Background Music'}</span>
                        </span>
                    </legend>
                    <div className="segmented-options segmented-options--2" role="radiogroup" aria-label={messages.settingsMusic || 'Background Music'}>
                        {musicOptions.map((opt) => {
                            const active = Boolean(musicEnabled) === opt.value;
                            const OptionIcon = opt.Icon;
                            return (
                                <label
                                    key={String(opt.value)}
                                    className={`segmented-label ${active ? ACTIVE_OPTION_CLASS : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="sudoku-music"
                                        value={String(opt.value)}
                                        checked={active}
                                        onChange={() => onChangeMusicEnabled(opt.value)}
                                    />
                                    <OptionIcon className="settings-icon settings-icon--option" />
                                    <span>{opt.label}</span>
                                </label>
                            );
                        })}
                    </div>
                    <div className={`settings-volume-row ${!musicEnabled ? 'settings-volume-row--disabled' : ''}`}>
                        <label htmlFor="sudoku-music-volume" className="settings-volume-row__label">
                            <IconVolume1 className="settings-icon settings-icon--volume" />
                            <span>{messages.volumeLabel || 'Volume'}</span>
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
                    <legend className="settings-fieldset__legend">
                        <span className="settings-fieldset__legend-inner">
                            <IconAudioLines className="settings-icon settings-icon--legend" />
                            <span>{messages.settingsSounds || 'Sound Effects'}</span>
                        </span>
                    </legend>
                    <div className="segmented-options segmented-options--2" role="radiogroup" aria-label={messages.settingsSounds || 'Sound Effects'}>
                        {soundOptions.map((opt) => {
                            const active = Boolean(soundEnabled) === opt.value;
                            const OptionIcon = opt.Icon;
                            return (
                                <label
                                    key={String(opt.value)}
                                    className={`segmented-label ${active ? ACTIVE_OPTION_CLASS : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="sudoku-sounds"
                                        value={String(opt.value)}
                                        checked={active}
                                        onChange={() => onChangeSoundEnabled(opt.value)}
                                    />
                                    <OptionIcon className="settings-icon settings-icon--option" />
                                    <span>{opt.label}</span>
                                </label>
                            );
                        })}
                    </div>
                    <div className={`settings-volume-row ${!soundEnabled ? 'settings-volume-row--disabled' : ''}`}>
                        <label htmlFor="sudoku-sound-volume" className="settings-volume-row__label">
                            <IconVolume1 className="settings-icon settings-icon--volume" />
                            <span>{messages.volumeLabel || 'Volume'}</span>
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
                    <h3 className="settings-guide-row__title">
                        <IconBookOpen className="settings-icon settings-icon--title" />
                        <span>{messages.settingsGuideTitle}</span>
                    </h3>
                    <p className="settings-guide-row__desc">{messages.settingsGuideDesc}</p>
                </div>
                <button
                    type="button"
                    id="settings-guide-btn"
                    className="btn-secondary settings-guide-row__btn"
                    onClick={onOpenGuide}
                >
                    <IconHelpCircle className="settings-icon settings-icon--btn" />
                    <span>{messages.openGuide}</span>
                </button>
            </div>
        </section>
    );
}
