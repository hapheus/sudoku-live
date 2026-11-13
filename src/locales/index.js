import en from './en.json';
import de from './de.json';

export const LOCALES = { en, de };

export function getMessages(lang) {
    return lang === 'de' ? de : en;
}
