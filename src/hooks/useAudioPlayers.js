import { useCallback, useEffect, useRef, useState } from 'react';
import {
    createBackgroundMusicPlayer,
    loadMusicEnabled,
    loadMusicVolume,
    saveMusicEnabled,
    saveMusicVolume,
} from '../services/background-music.js';
import {
    createSoundEffectsPlayer,
    loadSoundEnabled,
    loadSoundVolume,
    saveSoundEnabled,
    saveSoundVolume,
} from '../services/sound-effects.js';

export function useAudioPlayers() {
    const [musicEnabled, setMusicEnabled] = useState(() => loadMusicEnabled());
    const [musicVolume, setMusicVolume] = useState(() => loadMusicVolume());
    const [soundEnabled, setSoundEnabled] = useState(() => loadSoundEnabled());
    const [soundVolume, setSoundVolume] = useState(() => loadSoundVolume());

    const musicPlayerRef = useRef(null);
    const soundEffectsRef = useRef(null);

    useEffect(() => {
        const player = createBackgroundMusicPlayer();
        musicPlayerRef.current = player;
        player.start();
        return () => {
            player.destroy();
            musicPlayerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (musicPlayerRef.current && musicPlayerRef.current.isEnabled() !== musicEnabled) {
            musicPlayerRef.current.setEnabled(musicEnabled);
        }
    }, [musicEnabled]);

    useEffect(() => {
        if (musicPlayerRef.current && musicPlayerRef.current.getVolume() !== musicVolume) {
            musicPlayerRef.current.setVolume(musicVolume);
        }
    }, [musicVolume]);

    useEffect(() => {
        const sfx = createSoundEffectsPlayer();
        soundEffectsRef.current = sfx;
        return () => {
            sfx.destroy();
            soundEffectsRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (soundEffectsRef.current && soundEffectsRef.current.isEnabled() !== soundEnabled) {
            soundEffectsRef.current.setEnabled(soundEnabled);
        }
    }, [soundEnabled]);

    useEffect(() => {
        if (soundEffectsRef.current && soundEffectsRef.current.getVolume() !== soundVolume) {
            soundEffectsRef.current.setVolume(soundVolume);
        }
    }, [soundVolume]);

    const handleMusicEnabledChange = useCallback((nextEnabled) => {
        const resolved = Boolean(nextEnabled);
        saveMusicEnabled(resolved);
        musicPlayerRef.current?.setEnabled(resolved);
        setMusicEnabled(resolved);
    }, []);

    const handleMusicVolumeChange = useCallback((nextVolume) => {
        saveMusicVolume(nextVolume);
        musicPlayerRef.current?.setVolume(nextVolume);
        setMusicVolume(musicPlayerRef.current?.getVolume() ?? nextVolume);
    }, []);

    const handleSoundEnabledChange = useCallback((nextEnabled) => {
        const resolved = Boolean(nextEnabled);
        saveSoundEnabled(resolved);
        soundEffectsRef.current?.setEnabled(resolved);
        setSoundEnabled(resolved);
    }, []);

    const handleSoundVolumeChange = useCallback((nextVolume) => {
        saveSoundVolume(nextVolume);
        soundEffectsRef.current?.setVolume(nextVolume);
        setSoundVolume(soundEffectsRef.current?.getVolume() ?? nextVolume);
    }, []);

    return {
        musicEnabled,
        musicVolume,
        soundEnabled,
        soundVolume,
        soundEffectsRef,
        handleMusicEnabledChange,
        handleMusicVolumeChange,
        handleSoundEnabledChange,
        handleSoundVolumeChange,
    };
}
