/**
 * Unsent form drafts, so a reload does not throw away typed data.
 *
 * This holds census data about real families — names, national IDs, family
 * book numbers, phone numbers — so the storage is deliberately constrained:
 *
 *  - `sessionStorage`, not `localStorage`. It survives a reload, a back/forward
 *    navigation and an accidental in-tab navigation, which is the whole
 *    requirement, but it is gone when the tab closes. On a shared committee
 *    computer that is the difference between a draft outliving the person who
 *    typed it and not.
 *  - Keyed by the authenticated user id, so a draft can never surface for a
 *    different account on the same machine.
 *  - Given a short time to live, so an abandoned draft expires on its own.
 *  - Dropped on save, on an explicit discard, and on sign-out or session loss
 *    (see `clearAllDrafts`).
 *  - Never used for passwords or anything from the sign-in form.
 *
 * Every access is wrapped: storage throws in some private-browsing modes and
 * can be disabled outright, and a draft is a convenience, never a
 * requirement. A failure here must not break the form.
 */
const PREFIX = "count-daraa.draft.";
const TTL_MS = 12 * 60 * 60 * 1000;

interface Envelope<T> {
  /** Milliseconds since the epoch; used to expire an abandoned draft. */
  savedAt: number;
  value: T;
}

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const keyFor = (userId: string, form: string) => PREFIX + userId + "." + form;

/** Writes a draft. Silently does nothing when storage is unavailable. */
export function saveDraft<T>(userId: string, form: string, value: T): void {
  const storage = store();
  if (!storage) return;
  const envelope: Envelope<T> = { savedAt: Date.now(), value };
  try {
    storage.setItem(keyFor(userId, form), JSON.stringify(envelope));
  } catch {
    // Quota exceeded or storage blocked: the draft is simply not kept.
  }
}

/** Reads a draft, or null when absent, expired, unreadable or malformed. */
export function readDraft<T>(userId: string, form: string): T | null {
  const storage = store();
  if (!storage) return null;
  const key = keyFor(userId, form);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as Partial<Envelope<T>>;
    if (
      typeof envelope?.savedAt !== "number" ||
      Date.now() - envelope.savedAt > TTL_MS
    ) {
      storage.removeItem(key);
      return null;
    }
    return (envelope.value ?? null) as T | null;
  } catch {
    // Malformed or unreadable: drop it rather than letting it linger.
    try {
      storage.removeItem(key);
    } catch {
      /* nothing further to do */
    }
    return null;
  }
}

/** Drops one draft. Called after a successful save and on an explicit discard. */
export function clearDraft(userId: string, form: string): void {
  const storage = store();
  if (!storage) return;
  try {
    storage.removeItem(keyFor(userId, form));
  } catch {
    /* nothing further to do */
  }
}

/**
 * Drops every draft for every user. Called on sign-out and whenever the
 * session is lost, alongside the API cache reset: no personal data belonging
 * to a finished session may stay behind.
 */
export function clearAllDrafts(): void {
  const storage = store();
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    /* nothing further to do */
  }
}
