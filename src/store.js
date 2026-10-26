// Name und laufende Partie im Browser merken (übersteht Neuladen und App-Neustart)
const KEY = { name: 'ks.name', game: 'ks.game', fights: 'ks.fights', time: 'ks.time', level: 'ks.level', sfx: 'ks.sfx', music: 'ks.music', living: 'ks.living' };

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* privates Fenster */ } };

export const loadName = () => get(KEY.name) || '';
export const saveName = (name) => set(KEY.name, name.trim().slice(0, 24));

export const loadGame = () => { try { return JSON.parse(get(KEY.game)); } catch { return null; } };
export const saveGame = (snapshot) => set(KEY.game, JSON.stringify(snapshot));
export const clearGame = () => set(KEY.game, null);

export const loadFights = () => get(KEY.fights) !== '0';   // Standard: Kämpfe an
export const saveFights = (on) => set(KEY.fights, on ? '1' : '0');

export const loadTime = () => get(KEY.time) || 'none';   // gewählte Bedenkzeit
export const saveTime = (id) => set(KEY.time, id);

export const loadLevel = () => +get(KEY.level) || 3;      // Stärke des Computers (1–6)
export const saveLevel = (id) => set(KEY.level, String(id));

export const loadSfx = () => get(KEY.sfx) !== '0';         // Effekte an (Standard)
export const saveSfx = (on) => set(KEY.sfx, on ? '1' : '0');
export const loadMusic = () => get(KEY.music) !== '0';     // Musik an (Standard)
export const saveMusic = (on) => set(KEY.music, on ? '1' : '0');
export const loadLiving = () => get(KEY.living) === '1';    // Lebendige Figuren (Standard: Statuen)
export const saveLiving = (on) => set(KEY.living, on ? '1' : '0');
