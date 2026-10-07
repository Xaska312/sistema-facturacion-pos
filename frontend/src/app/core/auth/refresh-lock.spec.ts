import { Subject } from 'rxjs';
import { lockWith } from './refresh-lock';

/** LockManager de prueba: atiende las solicitudes de a una, en orden. */
function fakeLocks(): LockManager {
  let queue = Promise.resolve();
  return {
    request: (_name: string, _options: LockOptions, callback: () => Promise<void>) => {
      const run = queue.then(() => callback());
      queue = run.catch(() => undefined);
      return run;
    },
    query: () => Promise.resolve({ held: [], pending: [] }),
  } as unknown as LockManager;
}

describe('candado de renovación', () => {
  it('ejecuta las renovaciones de a una: la segunda empieza cuando termina la primera', async () => {
    const locks = fakeLocks();
    const first = new Subject<string>();
    const second = new Subject<string>();
    const started: string[] = [];
    const results: string[] = [];

    const lock = lockWith(locks);
    lock(first).subscribe((v) => results.push(v));
    lock(second).subscribe((v) => results.push(v));
    await new Promise((resolve) => setTimeout(resolve));
    started.push(first.observed ? 'primera' : '-', second.observed ? 'segunda' : '-');
    expect(started).toEqual(['primera', '-']);

    first.next('A');
    first.complete();
    await new Promise((resolve) => setTimeout(resolve));
    expect(second.observed).toBeTrue();
    second.next('B');
    second.complete();
    expect(results).toEqual(['A', 'B']);
  });

  it('sin Web Locks se ejecuta directo', () => {
    const source = new Subject<number>();
    let value = 0;
    lockWith(undefined)(source).subscribe((v) => (value = v));
    source.next(7);
    expect(value).toBe(7);
  });
});
