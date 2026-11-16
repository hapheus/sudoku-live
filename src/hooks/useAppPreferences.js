import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMessages } from '../locales/index.js';
import {
    loadJoinsAllowed,
    loadJoinsAutoAccept,
    resolveJoinPolicy,
    saveJoinsAllowed,
    saveJoinsAutoAccept,
} from '../services/join-settings.js';
import {
    generateRandomPlayerName,
    loadOrCreatePlayerName,
    savePlayerName,
} from '../services/player-name.js';
import { getStorageItem, setStorageItem } from '../utils/storage.js';

export function useAppPreferences() {
    const [theme, setTheme] = useState(() => (
        getStorageItem('sudoku_theme') === 'light' ? 'light' : 'dark'
    ));
    const [language, setLanguage] = useState(() => (
        getStorageItem('sudoku_lang') === 'de' ? 'de' : 'en'
    ));
    const [playerName, setPlayerNameState] = useState(() => loadOrCreatePlayerName());
    const [joinsAllowed, setJoinsAllowed] = useState(() => loadJoinsAllowed());
    const [joinsAutoAccept, setJoinsAutoAccept] = useState(() => loadJoinsAutoAccept());
    const joinPolicy = useMemo(() => resolveJoinPolicy(joinsAllowed, joinsAutoAccept), [joinsAllowed, joinsAutoAccept]);
    const messages = useMemo(() => getMessages(language), [language]);

    const setPlayerName = useCallback((nextName) => {
        const saved = savePlayerName(nextName);
        if (saved) {
            setPlayerNameState(saved);
        }
        return saved;
    }, []);

    const randomizePlayerName = useCallback(() => {
        const generated = generateRandomPlayerName();
        savePlayerName(generated);
        setPlayerNameState(generated);
        return generated;
    }, []);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
        setStorageItem('sudoku_theme', theme);
        const themeMeta = document.querySelector('meta[name="theme-color"]');
        if (themeMeta) {
            themeMeta.setAttribute('content', theme === 'light' ? '#f6f2ea' : '#13161b');
        }
    }, [theme]);

    useEffect(() => {
        document.documentElement.lang = language;
        setStorageItem('sudoku_lang', language);
    }, [language]);

    useEffect(() => {
        saveJoinsAllowed(joinsAllowed);
    }, [joinsAllowed]);

    useEffect(() => {
        saveJoinsAutoAccept(joinsAutoAccept);
    }, [joinsAutoAccept]);

    return {
        theme,
        setTheme,
        language,
        setLanguage,
        playerName,
        setPlayerName,
        randomizePlayerName,
        joinsAllowed,
        setJoinsAllowed,
        joinsAutoAccept,
        setJoinsAutoAccept,
        joinPolicy,
        messages,
    };
}
