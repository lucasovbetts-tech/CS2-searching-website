import { initLocale } from './locale.js';
import { initSteamAuth } from './steam-auth.js';

export function initHeader() {
    initLocale();
    initSteamAuth();
}
