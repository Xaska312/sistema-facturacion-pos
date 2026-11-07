package com.poshibrido.purchasing.application;

import com.poshibrido.shared.error.BusinessRuleException;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Archivos de la factura para leer con IA (decisión 295): firmas, tamaños, páginas y fotos reducidas. */
class InvoiceScanServiceTest {

    private static byte[] image(int w, int h, String format) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB), format, out);
        return out.toByteArray();
    }

    private static InvoiceScanService.Upload up(byte[] b) {
        return new InvoiceScanService.Upload("x", b);
    }

    private static byte[] pdf(int pages) {
        StringBuilder sb = new StringBuilder("%PDF-1.4\n1 0 obj << /Type /Pages /Count ").append(pages).append(" >>\n");
        for (int i = 0; i < pages; i++) {
            sb.append(i + 2).append(" 0 obj << /Type /Page /Parent 1 0 R >>\n");
        }
        return sb.toString().getBytes(StandardCharsets.ISO_8859_1);
    }

    @Test
    void photosAreRedrawnAsJpegOfAtMost1600Pixels() throws Exception {
        var p = InvoiceScanService.prepare(List.of(up(image(4000, 1000, "png"))));
        assertThat(p.kind()).isEqualTo("IMAGE");
        assertThat(p.contentType()).isEqualTo("image/jpeg");
        BufferedImage out = ImageIO.read(new ByteArrayInputStream(p.pages().getFirst().content()));
        assertThat(out.getWidth()).isEqualTo(1600);
        assertThat(out.getHeight()).isEqualTo(400);
        assertThat(InvoiceScanService.isJpeg(p.stored())).isTrue();
        // Una foto pequeña no se agranda; varias van juntas en un ZIP.
        var two = InvoiceScanService.prepare(List.of(up(image(300, 200, "jpeg")), up(image(300, 200, "jpeg"))));
        assertThat(two.contentType()).isEqualTo("application/zip");
        assertThat(two.pages()).hasSize(2);
        assertThat(ImageIO.read(new ByteArrayInputStream(two.pages().get(1).content())).getWidth()).isEqualTo(300);
    }

    @Test
    void aPdfGoesWholeUpToTenPages() {
        var p = InvoiceScanService.prepare(List.of(up(pdf(3))));
        assertThat(p.kind()).isEqualTo("PDF");
        assertThat(p.pages().getFirst().mediaType()).isEqualTo("application/pdf");
        assertThat(InvoiceScanService.pdfPages(pdf(3))).isEqualTo(3);
        assertThatThrownBy(() -> InvoiceScanService.prepare(List.of(up(pdf(11)))))
                .isInstanceOf(BusinessRuleException.class).hasMessageContaining("10 páginas");
    }

    @Test
    void rejectsWhatIsNotAPhotoOrAPdf() throws Exception {
        assertThatThrownBy(() -> InvoiceScanService.prepare(List.of()))
                .isInstanceOf(BusinessRuleException.class);
        assertThatThrownBy(() -> InvoiceScanService.prepare(List.of(up("<svg/>".getBytes(StandardCharsets.UTF_8)))))
                .hasMessageContaining("JPG o PNG");
        assertThatThrownBy(() -> InvoiceScanService.prepare(List.of(up(pdf(1)), up(image(10, 10, "png")))))
                .hasMessageContaining("un solo PDF");
        byte[] small = image(10, 10, "png");
        assertThatThrownBy(() -> InvoiceScanService.prepare(List.of(up(small), up(small), up(small), up(small),
                up(small), up(small)))).hasMessageContaining("máximo 5");
        // Firma de JPEG con contenido dañado.
        assertThatThrownBy(() -> InvoiceScanService.prepare(List.of(up(new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1, 2}))))
                .hasMessageContaining("No se pudo abrir");
    }
}
