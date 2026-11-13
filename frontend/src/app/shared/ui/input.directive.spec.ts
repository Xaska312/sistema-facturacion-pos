import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppInputDirective } from './input.directive';

@Component({
  imports: [AppInputDirective, ReactiveFormsModule],
  template: `
    <input appInput id="field" [formControl]="name" />
    <textarea appInput id="note"></textarea>
  `,
})
class InputHostComponent {
  readonly name = new FormControl('', Validators.required);
}

describe('AppInputDirective', () => {
  it('pone la clase del campo en inputs y textareas', () => {
    const fixture = TestBed.createComponent(InputHostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('#field')!.classList).toContain('app-input');
    expect(root.querySelector('#note')!.classList).toContain('app-input');
  });

  it('el estado de error lo dan las clases de Angular (inválido y ya tocado)', () => {
    const fixture = TestBed.createComponent(InputHostComponent);
    fixture.detectChanges();
    const field = (fixture.nativeElement as HTMLElement).querySelector('#field')!;
    expect(field.classList).toContain('ng-invalid');
    expect(field.classList).not.toContain('ng-dirty');
    fixture.componentInstance.name.markAsDirty();
    fixture.detectChanges();
    expect(field.classList).toContain('ng-dirty');
  });
});
