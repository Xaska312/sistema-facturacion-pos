import { draftDv, draftProblem, emptyDraft, toPartyInput } from './party-form';

describe('party-form', () => {
  it('calcula el DV solo para NIT', () => {
    const d = { ...emptyDraft(), documentType: 'NIT' as const, documentNumber: '800.197.268' };
    expect(draftDv(d)).toBe(4);
    expect(draftDv({ ...d, documentType: 'CC' })).toBeNull();
  });

  it('exige NIT para persona jurídica y nombres para natural', () => {
    expect(draftProblem({ ...emptyDraft(), personType: 'LEGAL', documentNumber: '123', businessName: 'X' }))
      .toContain('NIT');
    expect(draftProblem({ ...emptyDraft(), documentNumber: '123', firstNames: 'Ana' })).toContain('apellidos');
    expect(draftProblem({ ...emptyDraft(), documentNumber: '123', firstNames: 'Ana', lastNames: 'Gómez' })).toBeNull();
  });

  it('envía solo los campos del tipo de persona y los de cliente cuando aplica', () => {
    const d = { ...emptyDraft(), personType: 'LEGAL' as const, documentType: 'NIT' as const,
      documentNumber: '800197268', businessName: ' Empresa ', firstNames: 'x', creditLimit: 1000 };
    const asCustomer = toPartyInput(d, true);
    expect(asCustomer.businessName).toBe('Empresa');
    expect(asCustomer.firstNames).toBeNull();
    expect(asCustomer.verificationDigit).toBe(4);
    expect(asCustomer.creditLimit).toBe(1000);
    expect(toPartyInput(d, false).creditLimit).toBeUndefined();
  });
});
