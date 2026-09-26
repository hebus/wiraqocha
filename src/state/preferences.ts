const STORAGE_KEY = 'wiraqocha:preferences';

export interface Preferences {
  showJournal: boolean;
}

const DEFAULT_PREFERENCES: Preferences = { showJournal: true };

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: Preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private browsing / storage disabled — preference just won't persist across reloads.
  }
}
