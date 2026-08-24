import type { GameState } from './types';

export const SAVE_KEY = 'hex-pioneers-save-v1';

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GameState>;
  return candidate.version === 1 && Array.isArray(candidate.players) && candidate.players.length >= 3 && Boolean(candidate.board?.tiles?.length === 19);
}

export function saveGame(state: GameState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function loadGame(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isGameState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearGame() {
  if (typeof window !== 'undefined') localStorage.removeItem(SAVE_KEY);
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
