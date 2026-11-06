import { dataUrlBytes, fitInside, invoiceFilesProblem, shrinkPhoto } from './image-shrink';

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

  it('revisa las fotos o el PDF de una factura (decisión 295)', () => {
    const photo = { type: 'image/jpeg', name: 'a.jpg' };
    const pdf = { type: 'application/pdf', name: 'f.pdf' };
    expect(invoiceFilesProblem([])).toContain('Toma una foto');
    expect(invoiceFilesProblem([photo, photo, photo])).toBeNull();
    expect(invoiceFilesProblem([pdf])).toBeNull();
    expect(invoiceFilesProblem([pdf, photo])).toContain('un solo PDF');
    expect(invoiceFilesProblem(Array(6).fill(photo))).toContain('máximo 5');
  });

  it('reduce la foto a JPEG de máximo 1600 px y deja el PDF igual', async () => {
    const pdf = new File(['%PDF-1.4'], 'f.pdf', { type: 'application/pdf' });
    expect(await shrinkPhoto(pdf)).toBe(pdf);
    const canvas = document.createElement('canvas');
    canvas.width = 3200;
    canvas.height = 1600;
    const context = canvas.getContext('2d')!;
    for (let i = 0; i < 400; i++) {
      context.fillStyle = `rgb(${(i * 37) % 255}, ${(i * 91) % 255}, ${(i * 13) % 255})`;
      context.fillRect((i * 79) % 3200, (i * 53) % 1600, 120, 90);
    }
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    const out = await shrinkPhoto(new File([blob], 'foto.png', { type: 'image/png' }));
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('foto.jpg');
    const bitmap = await createImageBitmap(out);
    expect(bitmap.width).toBe(1600);
    expect(bitmap.height).toBe(800);
    bitmap.close();
  });
});
