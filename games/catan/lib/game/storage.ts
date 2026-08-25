import type { GameState } from './types';

export const LEGACY_SAVE_KEY = 'hex-pioneers-save-v1';
export const SAVE_SLOTS = [1, 2] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];
const SAVE_KEYS: Record<SaveSlot, string> = {
  1: 'catan-save-slot-1-v1',
  2: 'catan-save-slot-2-v1',
};

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GameState>;
  return candidate.version === 1 && Array.isArray(candidate.players) && candidate.players.length >= 3 && Boolean(candidate.board?.tiles?.length === 19);
}

function readGame(key: string): GameState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isGameState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function migrateLegacySave() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(SAVE_KEYS[1])) {
    localStorage.removeItem(LEGACY_SAVE_KEY);
    return;
  }
  const legacy = readGame(LEGACY_SAVE_KEY);
  if (!legacy) return;
  localStorage.setItem(SAVE_KEYS[1], JSON.stringify(legacy));
  localStorage.removeItem(LEGACY_SAVE_KEY);
}

export function saveGame(state: GameState, slot: SaveSlot) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SAVE_KEYS[slot], JSON.stringify(state));
  localStorage.removeItem(LEGACY_SAVE_KEY);
}

export function loadGame(slot: SaveSlot): GameState | null {
  if (typeof window === 'undefined') return null;
  migrateLegacySave();
  return readGame(SAVE_KEYS[slot]);
}

export function loadGames(): [GameState | null, GameState | null] {
  if (typeof window === 'undefined') return [null, null];
  migrateLegacySave();
  return [readGame(SAVE_KEYS[1]), readGame(SAVE_KEYS[2])];
}

export function clearGame(slot?: SaveSlot) {
  if (typeof window === 'undefined') return;
  if (slot) {
    localStorage.removeItem(SAVE_KEYS[slot]);
    return;
  }
  for (const saveSlot of SAVE_SLOTS) localStorage.removeItem(SAVE_KEYS[saveSlot]);
  localStorage.removeItem(LEGACY_SAVE_KEY);
}

export function exportGame(state: GameState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `카탄-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importGame(file: File): Promise<GameState> {
  const parsed: unknown = JSON.parse(await file.text());
  if (!isGameState(parsed)) throw new Error('지원하지 않거나 손상된 저장 파일입니다.');
  return parsed;
}
