import { Subject } from 'rxjs';
import { LatestRequest } from './latest-request';

describe('LatestRequest', () => {
  it('una respuesta vieja no pisa la más reciente (QA UI-10)', () => {
    const latest = new LatestRequest();
    const slow = new Subject<string>();
    const fast = new Subject<string>();
    const shown: string[] = [];
    slow.pipe(latest.only()).subscribe((v) => shown.push(v));
    fast.pipe(latest.only()).subscribe((v) => shown.push(v));

    fast.next('nueva');
    slow.next('vieja');
    expect(shown).toEqual(['nueva']);
    expect(slow.observed).toBeFalse();
  });

  it('las peticiones que terminan no afectan a la siguiente', () => {
    const latest = new LatestRequest();
    const first = new Subject<number>();
    const shown: number[] = [];
    first.pipe(latest.only()).subscribe((v) => shown.push(v));
    first.next(1);
    first.complete();
    const second = new Subject<number>();
    second.pipe(latest.only()).subscribe((v) => shown.push(v));
    second.next(2);
    expect(shown).toEqual([1, 2]);
  });
});
