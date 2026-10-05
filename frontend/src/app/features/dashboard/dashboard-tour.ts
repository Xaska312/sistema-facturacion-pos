import { TourDefinition } from '../../shared/tour/tour';

/** Recorrido del inicio con tablero (quien ve reportes). Los pasos apuntan a elementos con data-tour. */
export const DASHBOARD_TOUR: TourDefinition = {
  id: 'dashboard',
  steps: [
    {
      target: 'quick-actions',
      title: 'Lo que más usas',
      text: 'Desde aquí vas a vender, a tu caja o a los reportes. Si eres el dueño, debajo están tus primeros pasos.',
    },
    {
      target: 'period',
      title: 'Elige el periodo',
      text: 'Hoy, ayer, 7 o 30 días, el mes o un rango de fechas. Si tienes varias sucursales, elige una o todas.',
    },
    {
      target: 'kpis',
      title: 'Tus números clave',
      text: 'Lo vendido, cuántas ventas, el ticket promedio y la utilidad, comparados con el periodo anterior.',
    },
    {
      target: 'main-chart',
      title: 'Cómo van las ventas',
      text: 'Por hora si miras hoy; por día en periodos más largos, con el periodo anterior en línea punteada.',
    },
    {
      target: 'stock-alerts',
      title: 'Qué reponer',
      text: 'Los productos que llegaron a su existencia mínima. Desde aquí ves las existencias o haces un ajuste.',
    },
  ],
};
