import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { AppTitleStrategy, formatPageTitle } from './app-title.strategy';

@Component({ template: '' })
class BlankComponent {}

describe('AppTitleStrategy', () => {
  it('formatea el título de la pestaña', () => {
    expect(formatPageTitle('Productos')).toBe('Productos · POS Híbrido');
    expect(formatPageTitle(undefined)).toBe('POS Híbrido');
  });

  it('pone el título de la ruta activa', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'productos', title: 'Productos', component: BlankComponent }]),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/productos');
    expect(TestBed.inject(Title).getTitle()).toBe('Productos · POS Híbrido');
  });
});
