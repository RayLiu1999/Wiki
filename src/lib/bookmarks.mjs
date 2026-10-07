export const BOOKMARK_KEY = 'devwiki-bookmarks-v1';

/**
 * @param {string | null} raw
 * @param {string[]} allowedIds
 * @returns {string[]}
 */
export function parseBookmarks(raw, allowedIds) {
  try {
    const value = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) return [];
    const allowed = new Set(allowedIds);
    return [...new Set(value.filter((id) => typeof id === 'string' && allowed.has(id)))];
  } catch {
    return [];
  }
}

/**
 * @param {Pick<Storage, 'getItem'> | undefined} storage
 * @param {string[]} allowedIds
 */
export function readBookmarks(storage, allowedIds) {
  try {
    return parseBookmarks(storage?.getItem(BOOKMARK_KEY) ?? null, allowedIds);
  } catch {
    return [];
  }
}

/**
 * @param {Pick<Storage, 'setItem'> | undefined} storage
 * @param {string[]} ids
 */
export function writeBookmarks(storage, ids) {
  try {
    if (!storage) return false;
    storage.setItem(BOOKMARK_KEY, JSON.stringify([...new Set(ids)]));
    return true;
  } catch {
    return false;
  }
}
