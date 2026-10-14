// IndexedDB-backed persistence for the in-progress editor video ("draft").
//
// The recorded/uploaded video otherwise lives only in memory (see blobStore), so
// an accidental refresh before the user saves or exports discards the video
// entirely. IndexedDB (not localStorage) is used because it stores large Blobs
// natively without the ~5MB string limit. See issue #226.

const DB_NAME = "marvedge-editor";
const DB_VERSION = 1;
const STORE_NAME = "video-draft";
const BLOB_KEY = "blob";
const META_KEY = "meta";

export interface VideoDraftMeta {
  // Identifies which draft the persisted editing state (localStorage) belongs to,
  // so stale edits are never applied to a different video.
  draftId: string;
  type: string;
  name: string;
  title: string;
  description: string;
  sourceDuration: number;
  savedAt: number;
  canonicalVideoUrl?: string | null;
}

export interface VideoDraft {
  blob: Blob;
  meta: VideoDraftMeta | null;
}

function getIndexedDb(): IDBFactory | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.indexedDB ?? null;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = getIndexedDb();
    if (!idb) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = idb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

function runWrite(db: IDBDatabase, work: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    work(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function getValue<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

// Persists the video blob together with its metadata in a single transaction.
export async function saveVideoDraft(blob: Blob, meta: VideoDraftMeta): Promise<void> {
  const db = await openDb();
  try {
    await runWrite(db, (store) => {
      store.put(blob, BLOB_KEY);
      store.put(meta, META_KEY);
    });
  } finally {
    db.close();
  }
}

// Updates only the metadata (title/description/duration) without rewriting the blob.
export async function saveVideoDraftMeta(meta: VideoDraftMeta): Promise<void> {
  const db = await openDb();
  try {
    await runWrite(db, (store) => {
      store.put(meta, META_KEY);
    });
  } finally {
    db.close();
  }
}

export async function loadVideoDraft(): Promise<VideoDraft | null> {
  const db = await openDb();
  try {
    const [blob, meta] = await Promise.all([
      getValue<Blob>(db, BLOB_KEY),
      getValue<VideoDraftMeta>(db, META_KEY),
    ]);
    if (!blob) {
      return null;
    }
    return { blob, meta: meta ?? null };
  } finally {
    db.close();
  }
}

export async function clearVideoDraft(): Promise<void> {
  const db = await openDb();
  try {
    await runWrite(db, (store) => {
      store.clear();
    });
  } finally {
    db.close();
  }
}
