import { LEGAL_OWNER, PRIVACY_POLICY, TERMS, legalDocument } from './legal-content';

describe('legal-content', () => {
  it('cada documento tiene su versión y numerales con enlace propio', () => {
    for (const doc of [TERMS, PRIVACY_POLICY]) {
      expect(doc.version).toMatch(/^\d+\.\d+$/);
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(doc.sections.every((s) => s.blocks.length > 0)).toBeTrue();
    }
  });

  it('la política trae lo que pide el Decreto 1074 de 2015: responsable, derechos, procedimiento y vigencia', () => {
    const ids = PRIVACY_POLICY.sections.map((s) => s.id);
    expect(ids).toEqual(jasmine.arrayContaining(['responsable', 'finalidades', 'derechos', 'procedimiento', 'cambios']));
    const text = JSON.stringify(PRIVACY_POLICY);
    expect(text).toContain(LEGAL_OWNER.email);
    expect(text).toContain('10 días hábiles');
    expect(text).toContain('15 días hábiles');
  });

  it('los términos 1.1 traen el alcance tributario, la obligación de medio y la propiedad intelectual', () => {
    const ids = TERMS.sections.map((s) => s.id);
    expect(ids).toContain('propiedad-intelectual');
    const text = JSON.stringify(TERMS);
    expect(text).toContain('Resolución 000165 de 2023');
    expect(text).toContain('obligación de medio');
    expect(text).toContain('Decisión Andina 351');
    expect(JSON.stringify(PRIVACY_POLICY)).toContain('mantener indemne a XASKA');
  });

  it('elige el documento por ruta', () => {
    expect(legalDocument('terminos')).toBe(TERMS);
    expect(legalDocument('privacidad')).toBe(PRIVACY_POLICY);
  });
});
