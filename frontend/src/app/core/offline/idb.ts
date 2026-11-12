/**
 * Almacén clave-valor en IndexedDB (decisión 332): la copia del catálogo y las ventas hechas sin internet quedan en el
 * equipo aunque se cierre el navegador. Si IndexedDB no está disponible (modo privado de algunos navegadores), todo
 * queda en memoria y se avisa con {@link idbAvailable}.
 */
const DB_NAME = 'xaska-pos';
const STORE = 'kv';

let opening: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const request = globalThis.indexedDB?.open(DB_NAME, 1);
      if (!request) {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

export async function idbAvailable(): Promise<boolean> {
  return (await open()) !== null;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) {
    return memory.get(key) as T | undefined;
  }
  return new Promise((resolve) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => resolve(memory.get(key) as T | undefined);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  const db = await open();
  if (!db) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar en el equipo.'));
  });
}
