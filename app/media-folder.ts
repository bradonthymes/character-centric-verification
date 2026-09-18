'use client';

/**
 * Reading the study films from a folder on the participant's own machine.
 *
 * Nothing is uploaded: the browser hands us `File` objects, and an object URL
 * built from one plays and seeks like any other video source.
 *
 * Two ways in, because the good one is Chromium-only:
 *  - `showDirectoryPicker()` returns a handle we can keep in IndexedDB, so a
 *    returning participant re-grants access in a single click.
 *  - `<input type="file" webkitdirectory>` works everywhere but cannot be
 *    persisted, so those participants re-pick the folder each session.
 *
 * Files are matched on basename alone, so the folder may be nested or hold
 * extra files — but a renamed film reads as missing.
 */

type DirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (options: {
    mode: 'read' | 'readwrite';
  }) => Promise<PermissionState>;
  requestPermission?: (options: {
    mode: 'read' | 'readwrite';
  }) => Promise<PermissionState>;
  values: () => AsyncIterableIterator<FileSystemHandle>;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
    }) => Promise<DirectoryHandle>;
  }
}

const DB_NAME = 'videoqa-media-folder';
const STORE = 'handles';
const HANDLE_KEY = 'study-folder';
const VIDEO_PATTERN = /\.(mp4|m4v|mov|mkv|webm)$/i;

export type FolderFiles = Map<string, File>;

export function supportsDirectoryPicker() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const request = action(
        database.transaction(STORE, mode).objectStore(STORE),
      );
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export const saveFolderHandle = (handle: DirectoryHandle) =>
  withStore('readwrite', (store) => store.put(handle, HANDLE_KEY));

export const loadFolderHandle = () =>
  withStore<DirectoryHandle>('readonly', (store) => store.get(HANDLE_KEY));

export const forgetFolderHandle = () =>
  withStore('readwrite', (store) => store.delete(HANDLE_KEY));

/** 'granted' needs no gesture; 'prompt' needs a click; 'denied' needs a new pick. */
export async function folderPermission(
  handle: DirectoryHandle,
  request = false,
): Promise<PermissionState> {
  try {
    const query = request ? handle.requestPermission : handle.queryPermission;
    if (!query) return 'granted';
    return await query.call(handle, { mode: 'read' });
  } catch {
    return 'denied';
  }
}

export async function pickFolder(): Promise<DirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null;
  try {
    // `id` makes the browser reopen the same place next time.
    return await window.showDirectoryPicker({
      id: 'videoqa-study-media',
      mode: 'read',
    });
  } catch {
    return null; // the participant dismissed the dialog
  }
}

/** Walk a directory handle, collecting video files by basename. */
export async function readFolderHandle(
  handle: DirectoryHandle,
  depth = 3,
): Promise<FolderFiles> {
  const files: FolderFiles = new Map();
  const visit = async (directory: DirectoryHandle, remaining: number) => {
    for await (const entry of directory.values()) {
      if (entry.kind === 'file' && VIDEO_PATTERN.test(entry.name)) {
        if (files.has(entry.name)) continue;
        files.set(entry.name, await (entry as FileSystemFileHandle).getFile());
      } else if (entry.kind === 'directory' && remaining > 0) {
        await visit(entry as DirectoryHandle, remaining - 1);
      }
    }
  };
  await visit(handle, depth);
  return files;
}

/** Same shape, from the `webkitdirectory` fallback input. */
export function readFileList(list: FileList | null): FolderFiles {
  const files: FolderFiles = new Map();
  for (const file of Array.from(list ?? [])) {
    if (VIDEO_PATTERN.test(file.name) && !files.has(file.name)) {
      files.set(file.name, file);
    }
  }
  return files;
}
