import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { SCREEN_HELP } from '../../shared/help/screen-help';
import { MANUAL, MANUAL_SECTION_IDS, filterManual } from './manual-content';
import { ManualComponent, manualLink } from './manual.component';

describe('contenido del manual', () => {
  it('cada capítulo y sección tiene un id único (son enlaces compartidos)', () => {
    const ids = MANUAL.flatMap((c) => [c.id, ...c.sections.map((s) => s.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('glosario');
    expect(ids.every((id) => /^[a-z0-9-]+$/.test(id))).toBeTrue();
  });

  it('cada sección explica algo: resumen y pasos, consejos o tabla', () => {
    for (const chapter of MANUAL) {
      for (const section of chapter.sections) {
        expect(section.summary.length).withContext(section.id).toBeGreaterThan(10);
        const body = (section.steps?.length ?? 0) + (section.tips?.length ?? 0) + (section.table?.rows.length ?? 0);
        expect(body).withContext(section.id).toBeGreaterThan(0);
      }
    }
  });

  it('la ayuda de cada pantalla enlaza a una sección que existe', () => {
    const broken = Object.entries(SCREEN_HELP)
      .filter(([, topic]) => topic.manual && !MANUAL_SECTION_IDS.has(topic.manual))
      .map(([route]) => route);
    expect(broken).toEqual([]);
  });

  it('busca sin importar tildes ni mayúsculas y exige todas las palabras', () => {
    const ids = (query: string) => filterManual(query).flatMap((c) => c.sections.map((s) => s.id));
    expect(ids('')).toEqual(MANUAL.flatMap((c) => c.sections.map((s) => s.id)));
    expect(ids('CONTRASENA olvidaste')).toContain('olvide-contrasena');
    expect(ids('F4')).toContain('atajos');
    expect(ids('arqueo')).toContain('cerrar-caja');
    expect(ids('xyz-no-existe')).toEqual([]);
  });

  it('arma el enlace para compartir una sección', () => {
    expect(manualLink('https://pos.midominio.com/', 'cobrar')).toBe('https://pos.midominio.com/manual#cobrar');
  });
});

describe('ManualComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ManualComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), MessageService],
    });
  });

  function text(fixture: { nativeElement: HTMLElement }): string {
    return fixture.nativeElement.textContent ?? '';
  }

  it('se ve sin sesión, con todos los capítulos y el glosario', () => {
    const fixture = TestBed.createComponent(ManualComponent);
    fixture.detectChanges();
    expect(text(fixture)).toContain('Cómo usar POS Híbrido');
    for (const chapter of MANUAL) {
      expect(fixture.nativeElement.querySelector(`#${chapter.id}`)).withContext(chapter.id).not.toBeNull();
    }
    expect(text(fixture)).toContain('Palabras clave');
    expect(text(fixture)).toContain('Entrar');
  });

  it('el buscador filtra las secciones y avisa si no encuentra nada', () => {
    const fixture = TestBed.createComponent(ManualComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;

    input.value = 'invitar';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#invitar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#cobrar')).toBeNull();

    input.value = 'palabra-que-no-esta';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(text(fixture)).toContain('No encontramos');
  });
});
