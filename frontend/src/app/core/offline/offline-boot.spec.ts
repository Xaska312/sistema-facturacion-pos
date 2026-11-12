import { OFFLINE_BOOT_MS, OfflineBoot, clearOfflineBoot, readOfflineBoot, saveOfflineBoot } from './offline-boot';

const BOOT = {
  savedAt: 1_000_000,
  user: { id: 'u1', email: 'ana@demo.test', fullName: 'Ana', platformAdmin: false, emailVerified: true },
  claims: { sub: 'u1', exp: 0, typ: 'tenant', tid: 't1', perms: ['sales:create'] },
  tenant: { id: 't1' },
  session: { id: 's1' },
  config: {},
  methods: [],
  decimalUnitIds: [],
} as unknown as OfflineBoot;

describe('Abrir Vender sin internet (decisión 333)', () => {
  afterEach(() => clearOfflineBoot());

  it('recuerda la caja 24 horas y después la olvida', () => {
    saveOfflineBoot(BOOT);
    expect(readOfflineBoot(BOOT.savedAt + 60_000)?.session.id).toBe('s1');
    expect(readOfflineBoot(BOOT.savedAt + OFFLINE_BOOT_MS + 1)).toBeNull();
    // Venció: se borró
    expect(readOfflineBoot(BOOT.savedAt)).toBeNull();
  });

  it('no acepta datos incompletos ni con fecha del futuro', () => {
    saveOfflineBoot({ ...BOOT, claims: { ...BOOT.claims, tid: undefined } });
    expect(readOfflineBoot(BOOT.savedAt)).toBeNull();
    saveOfflineBoot(BOOT);
    expect(readOfflineBoot(BOOT.savedAt - 10 * 60_000)).toBeNull();
  });
});
