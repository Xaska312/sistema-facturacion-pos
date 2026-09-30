import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <main class="flex items-center justify-center min-h-screen bg-gray-50">
      <div class="text-center">
        <h1 class="text-4xl font-bold text-blue-600 mb-4">POS Híbrido</h1>
        <p class="text-lg text-gray-600">Frontend Angular 19 inicializado correctamente.</p>
      </div>
    </main>
  `,
})
export class AppComponent {
  title = 'pos-hibrido-frontend';
}