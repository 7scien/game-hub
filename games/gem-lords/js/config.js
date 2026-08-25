export const STORAGE_KEY = 'gem-lords-save-v2';
export const SAVE_SLOTS_KEY = 'gem-lords-save-slots-v1';
export const TITLE_STORAGE_KEY = 'gem-lords-custom-title-v1';
export const DEFAULT_GAME_TITLE = '보석의 군주';
export const MAX_TITLE_LENGTH = 18;
export const MAX_PLAYER_NAME_LENGTH = 12;
export const MAX_SAVE_SLOTS = 3;

export function normalizeGameTitle(value) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  return (normalized || DEFAULT_GAME_TITLE).slice(0, MAX_TITLE_LENGTH);
}

export function normalizePlayerName(value, index = 0) {
  const fallback = `플레이어 ${index + 1}`;
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  return (normalized || fallback).slice(0, MAX_PLAYER_NAME_LENGTH);
}
