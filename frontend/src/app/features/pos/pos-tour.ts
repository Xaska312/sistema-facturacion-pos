import { TourDefinition } from '../../shared/tour/tour';

/** Recorrido de la pantalla de venta (la primera vez que alguien entra con la caja abierta). */
export const POS_TOUR: TourDefinition = {
  id: 'pos',
  steps: [
    {
      target: 'scanner',
      title: 'Escanea o escribe',
      text: 'Pasa el lector por el código de barras, o escribe el código y Enter. Para varias unidades: 3*código.',
    },
    {
      target: 'products',
      title: 'Toca para agregar',
      text: 'Elige una categoría y toca el producto. Con la estrella lo dejas en Favoritos para encontrarlo rápido.',
    },
    {
      target: 'cart',
      title: 'Revisa la venta',
      text: 'Cambia la cantidad con − y +, toca la línea para el descuento, o quítala (puedes deshacer).',
    },
    {
      target: 'charge',
      title: 'Cobra',
      text: 'Toca Cobrar o pulsa F4. Elige cómo te pagan y registra la venta: el cambio se ve en grande.',
    },
    {
      target: 'pos-help',
      title: 'Atajos y ayuda',
      text: 'Aquí están los atajos de teclado (también con la tecla ?) y puedes repetir este recorrido.',
    },
  ],
};
