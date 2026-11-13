import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SkeletonComponent } from './skeleton.component';

@Component({
  imports: [SkeletonComponent],
  template: `
    <app-skeleton id="default" />
    <app-skeleton id="custom" height="3rem" width="40%" borderRadius="14px" />
  `,
})
class SkeletonHostComponent {}

describe('SkeletonComponent', () => {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(SkeletonHostComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ocupa todo el ancho y 1rem de alto por defecto, y no lo leen los lectores de pantalla', () => {
    const el = render().querySelector<HTMLElement>('#default')!;
    expect(el.classList).toContain('app-skeleton');
    expect(el.style.width).toBe('100%');
    expect(el.style.height).toBe('1rem');
    expect(el.style.borderRadius).toBe('');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('respeta alto, ancho y esquinas', () => {
    const el = render().querySelector<HTMLElement>('#custom')!;
    expect(el.style.height).toBe('3rem');
    expect(el.style.width).toBe('40%');
    expect(el.style.borderRadius).toBe('14px');
  });
});
