import { RELEASES, unseenReleases } from './releases';

describe('Novedades (decisión 354)', () => {
  it('quien nunca las vio ve solo la última; quien vio una vieja ve las posteriores', () => {
    expect(unseenReleases(RELEASES, null).map((r) => r.id)).toEqual([RELEASES[0].id]);
    expect(unseenReleases(RELEASES, RELEASES[2].id).map((r) => r.id)).toEqual([RELEASES[0].id, RELEASES[1].id]);
    expect(unseenReleases(RELEASES, RELEASES[0].id)).toEqual([]);
  });

  it('van de la más reciente a la más vieja, con fecha como id y puntos cortos', () => {
    const ids = RELEASES.map((r) => r.id);
    expect([...ids].sort().reverse()).toEqual(ids);
    for (const r of RELEASES) {
      expect(r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.items.length).toBeGreaterThan(0);
      r.items.forEach((i) => expect(i.length).toBeLessThan(160));
    }
  });
});
