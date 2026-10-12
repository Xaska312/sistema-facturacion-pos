import { dataUrlBytes, fitInside } from './image-shrink';

describe('image-shrink (fase 8c)', () => {
  it('calcula los bytes reales de una data URL', () => {
    expect(dataUrlBytes('data:image/png;base64,QUJD')).toBe(3);
    expect(dataUrlBytes('data:image/png;base64,QUI=')).toBe(2);
    expect(dataUrlBytes('data:image/png;base64,QQ==')).toBe(1);
  });

  it('reduce al lado mayor sin agrandar', () => {
    expect(fitInside(1600, 800, 320)).toEqual({ width: 320, height: 160 });
    expect(fitInside(400, 1000, 320)).toEqual({ width: 128, height: 320 });
    expect(fitInside(100, 50, 320)).toEqual({ width: 100, height: 50 });
  });
});
