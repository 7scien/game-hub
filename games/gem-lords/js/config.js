export const STORAGE_KEY = 'gem-lords-save-v2';
export const TITLE_STORAGE_KEY = 'gem-lords-custom-title-v1';
export const DEFAULT_GAME_TITLE = '보석의 군주';
export const MAX_TITLE_LENGTH = 18;

export function normalizeGameTitle(value) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  return (normalized || DEFAULT_GAME_TITLE).slice(0, MAX_TITLE_LENGTH);
}
