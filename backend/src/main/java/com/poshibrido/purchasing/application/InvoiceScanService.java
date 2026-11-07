package com.poshibrido.purchasing.application;

import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.purchasing.application.InvoiceDocumentService.InvoiceDraft;
import com.poshibrido.purchasing.application.InvoiceReader.Page;
import com.poshibrido.purchasing.application.InvoiceReader.ReaderUnavailableException;
import com.poshibrido.purchasing.application.InvoiceReader.Result;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.subscription.application.SubscriptionApi;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import com.poshibrido.tenancy.application.TenantRef;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Ingresar la mercancía con la foto o el PDF de la factura (decisión 295): hasta 5 fotos o un PDF de hasta 10 páginas
 * de una factura; la IA la lee y XASKA arma el mismo borrador que con el XML, para revisarlo en "Recibir mercancía".
 * Nada se registra sin que una persona confirme.
 * <ul>
 *   <li>Archivos reconocidos por su firma (JPEG, PNG o PDF), nunca por el nombre. Las fotos se vuelven a dibujar en
 *       JPEG de máximo 1.600 px (sin datos ocultos ni ubicación) antes de leerlas y guardarlas.</li>
 *   <li>Tope por mes según el plan (más los extras de la consola): una factura leída cuenta una vez aunque tenga varias
 *       fotos; si no se pudo leer o el servicio no respondió, no cuenta.</li>
 *   <li>La llamada a la IA va fuera de toda transacción (puede tardar decenas de segundos).</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InvoiceScanService {

    public static final int MAX_PHOTOS = 5;
    public static final int MAX_PHOTO_BYTES = 10 * 1024 * 1024;
    static final int MAX_PDF_BYTES = 10 * 1024 * 1024;
    static final int MAX_PDF_PAGES = 10;
    static final int MAX_SIDE = 1600;
    private static final Pattern PDF_PAGE = Pattern.compile("/Type\\s*/Page(?![a-zA-Z])");

    private final InvoiceReader reader;
    private final InvoiceDocumentService documents;
    private final SubscriptionApi subscriptions;
    private final BusinessSettingsApi settings;
    private final TransactionTemplate tx;

    @PersistenceContext
    private EntityManager em;

    /** Un archivo subido. */
    public record Upload(String name, byte[] content) {
    }

    /** Lecturas del mes: {@code limit} nulo = sin límite; {@code available}: la lectura con IA está encendida. */
    public record Usage(boolean available, Integer limit, long used) {
    }

    public Usage usage() {
        return new Usage(reader.available(), limit(), tx.execute(s -> usedThisMonth()));
    }

    public InvoiceDraft scan(List<Upload> uploads) {
        if (!reader.available()) {
            throw new BusinessRuleException("La lectura con IA aún no está activa. Carga el XML de la factura o "
                    + "ingrésala a mano.");
        }
        Prepared prepared = prepare(uploads);
        Integer limit = limit();
        long used = tx.execute(s -> usedThisMonth());
        if (limit != null && used >= limit) {
            throw new BusinessRuleException(limit == 0
                    ? "La lectura de facturas con foto o PDF es parte de XASKA IA, que este negocio no tiene activo. Carga el "
                      + "XML o ingresa la factura a mano."
                    : "Llegaste a las " + limit + " lecturas con IA de este mes. Carga el XML o ingresa la factura a "
                      + "mano; si necesitas más, escríbenos.");
        }
        UUID actor = CurrentActor.requireUserId();
        Result result;
        try {
            result = reader.read(prepared.pages());
        } catch (ReaderUnavailableException ex) {
            log.warn("Lectura de factura con IA sin respuesta: {}", ex.getMessage());
            record(null, "UNAVAILABLE", prepared.pages().size(), null, ex.getMessage(), actor);
            throw new BusinessRuleException("La lectura con IA no respondió. Intenta de nuevo en un momento o ingresa "
                    + "la factura a mano. No se descontó de tus lecturas.");
        }
        if (!result.readable()) {
            record(null, "FAILED", prepared.pages().size(), result, result.problem(), actor);
            throw new BusinessRuleException(result.problem() + " No se descontó de tus lecturas.");
        }
        return tx.execute(s -> {
            InvoiceDraft draft = documents.fromScan(prepared.kind(), prepared.contentType(), prepared.fileName(),
                    prepared.stored(), result.invoice());
            insertScan(draft.documentId(), "OK", prepared.pages().size(), result, null, actor);
            return draft;
        });
    }

    // ------------------------------------------------------------------ archivos

    record Prepared(String kind, String contentType, String fileName, byte[] stored, List<Page> pages) {
    }

    static Prepared prepare(List<Upload> uploads) {
        List<Upload> files = uploads == null ? List.of() : uploads.stream()
                .filter(u -> u != null && u.content() != null && u.content().length > 0).toList();
        if (files.isEmpty()) {
            throw new BusinessRuleException("Toma una foto de la factura o sube su PDF.");
        }
        boolean anyPdf = files.stream().anyMatch(f -> isPdf(f.content()));
        if (anyPdf) {
            if (files.size() > 1) {
                throw new BusinessRuleException("Sube un solo PDF por factura (o hasta " + MAX_PHOTOS + " fotos).");
            }
            byte[] pdf = files.getFirst().content();
            if (pdf.length > MAX_PDF_BYTES) {
                throw new BusinessRuleException("El PDF supera 10 MB.");
            }
            if (pdfPages(pdf) > MAX_PDF_PAGES) {
                throw new BusinessRuleException("El PDF tiene más de " + MAX_PDF_PAGES + " páginas: sube solo las de la factura.");
            }
            return new Prepared("PDF", "application/pdf", "factura.pdf", pdf, List.of(new Page("application/pdf", pdf)));
        }
        if (files.size() > MAX_PHOTOS) {
            throw new BusinessRuleException("Sube máximo " + MAX_PHOTOS + " fotos por factura.");
        }
        List<Page> pages = new ArrayList<>();
        for (Upload f : files) {
            if (f.content().length > MAX_PHOTO_BYTES) {
                throw new BusinessRuleException("Una de las fotos supera 10 MB.");
            }
            if (!isJpeg(f.content()) && !isPng(f.content())) {
                throw new BusinessRuleException("Sube fotos en JPG o PNG, o el PDF de la factura.");
            }
            pages.add(new Page("image/jpeg", reencode(f.content())));
        }
        if (pages.size() == 1) {
            return new Prepared("IMAGE", "image/jpeg", "factura.jpg", pages.getFirst().content(), pages);
        }
        return new Prepared("IMAGE", "application/zip", "factura-fotos.zip", zip(pages), pages);
    }

    public static boolean isPdf(byte[] b) {
        return b.length >= 5 && b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F' && b[4] == '-';
    }

    public static boolean isJpeg(byte[] b) {
        return b.length >= 3 && (b[0] & 0xff) == 0xFF && (b[1] & 0xff) == 0xD8 && (b[2] & 0xff) == 0xFF;
    }

    public static boolean isPng(byte[] b) {
        return b.length >= 8 && (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
    }

    /** Páginas de un PDF (aproximado: cuenta los objetos /Type /Page). */
    public static int pdfPages(byte[] pdf) {
        Matcher m = PDF_PAGE.matcher(new String(pdf, StandardCharsets.ISO_8859_1));
        int count = 0;
        while (m.find()) {
            count++;
        }
        return count;
    }

    /** Vuelve a dibujar la foto en JPEG de máximo {@link #MAX_SIDE} px: sin metadatos (ubicación, cámara). */
    public static byte[] reencode(byte[] bytes) {
        BufferedImage source;
        try {
            source = ImageIO.read(new ByteArrayInputStream(bytes));
        } catch (IOException | RuntimeException ex) {
            source = null;
        }
        if (source == null) {
            throw new BusinessRuleException("No se pudo abrir una de las fotos. Tómala de nuevo en JPG.");
        }
        double scale = Math.min(1.0, (double) MAX_SIDE / Math.max(source.getWidth(), source.getHeight()));
        int w = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int h = Math.max(1, (int) Math.round(source.getHeight() * scale));
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setColor(java.awt.Color.WHITE);
            g.fillRect(0, 0, w, h);
            g.drawImage(source, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(buffer)) {
            writer.setOutput(ios);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(0.85f);
            writer.write(null, new IIOImage(out, null, null), param);
        } catch (IOException ex) {
            throw new BusinessRuleException("No se pudo procesar una de las fotos.");
        } finally {
            writer.dispose();
        }
        return buffer.toByteArray();
    }

    private static byte[] zip(List<Page> pages) {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(buffer)) {
            for (int i = 0; i < pages.size(); i++) {
                zip.putNextEntry(new ZipEntry("factura-" + (i + 1) + ".jpg"));
                zip.write(pages.get(i).content());
                zip.closeEntry();
            }
        } catch (IOException ex) {
            throw new BusinessRuleException("No se pudieron guardar las fotos.");
        }
        return buffer.toByteArray();
    }

    // ------------------------------------------------------------------ tope y registro

    private Integer limit() {
        TenantRef tenant = TenantContext.current()
                .orElseThrow(() -> new BusinessRuleException("Entra a un negocio para leer facturas."));
        return subscriptions.invoiceScansPerMonth(tenant.id());
    }

    /** Lecturas que cuentan este mes (en la zona horaria del negocio). */
    private long usedThisMonth() {
        ZoneId zone = ZoneId.of(settings.current().timezone());
        Instant start = LocalDate.now(zone).withDayOfMonth(1).atStartOfDay(zone).toInstant();
        return ((Number) em.createNativeQuery("""
                SELECT count(*) FROM purchase_invoice_scans WHERE status = 'OK' AND created_at >= ?1""")
                .setParameter(1, Timestamp.from(start)).getSingleResult()).longValue();
    }

    private void record(UUID documentId, String status, int pages, Result result, String reason, UUID actor) {
        tx.executeWithoutResult(s -> insertScan(documentId, status, pages, result, reason, actor));
    }

    private void insertScan(UUID documentId, String status, int pages, Result result, String reason, UUID actor) {
        em.createNativeQuery("""
                INSERT INTO purchase_invoice_scans (id, document_id, status, pages, model, input_tokens, output_tokens,
                                                    reason, created_by, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)""")
                .setParameter(1, Ids.newId()).setParameter(2, documentId).setParameter(3, status)
                .setParameter(4, pages).setParameter(5, result == null ? null : result.model())
                .setParameter(6, result == null ? 0 : result.inputTokens())
                .setParameter(7, result == null ? 0 : result.outputTokens())
                .setParameter(8, reason == null ? null : reason.length() > 200 ? reason.substring(0, 200) : reason)
                .setParameter(9, actor).setParameter(10, Timestamp.from(Instant.now())).executeUpdate();
    }
}
