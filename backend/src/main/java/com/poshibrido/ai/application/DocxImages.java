package com.poshibrido.ai.application;

import com.poshibrido.purchasing.application.InvoiceScanService;
import com.poshibrido.shared.error.BusinessRuleException;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Fotos de un Word (decisión 313): un .docx con las fotos del cuaderno se lee como esas fotos, en el orden en que
 * aparecen en el documento. Solo JPG y PNG; el texto del Word no se usa.
 */
final class DocxImages {

    /** Lo que se descomprime como máximo (un Word con fotos de celular pesa unos pocos MB). */
    static final long MAX_UNZIPPED = 60L * 1024 * 1024;
    private static final Pattern EMBED = Pattern.compile("r:embed=\"([^\"]+)\"");
    private static final Pattern REL = Pattern.compile("<Relationship\\b[^>]*>");
    private static final Pattern ATTR = Pattern.compile("(\\w+)=\"([^\"]*)\"");

    private DocxImages() {
    }

    static boolean isDocx(byte[] bytes) {
        if (bytes == null || bytes.length < 4 || bytes[0] != 'P' || bytes[1] != 'K') {
            return false;
        }
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            for (ZipEntry e; (e = zip.getNextEntry()) != null; ) {
                if ("word/document.xml".equals(e.getName())) {
                    return true;
                }
            }
        } catch (IOException ex) {
            return false;
        }
        return false;
    }

    /** Las fotos JPG o PNG del documento, en orden; una foto repetida cuenta una vez. */
    static List<byte[]> images(byte[] docx) {
        Map<String, byte[]> parts = new HashMap<>();
        long total = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(docx))) {
            for (ZipEntry e; (e = zip.getNextEntry()) != null; ) {
                String name = e.getName();
                if (!name.equals("word/document.xml") && !name.equals("word/_rels/document.xml.rels")
                        && !name.startsWith("word/media/")) {
                    continue;
                }
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                for (int n; (n = zip.read(buf)) > 0; ) {
                    total += n;
                    if (total > MAX_UNZIPPED) {
                        throw new BusinessRuleException("El Word es muy grande: súbelo en partes o como fotos.");
                    }
                    out.write(buf, 0, n);
                }
                parts.put(name, out.toByteArray());
            }
        } catch (IOException ex) {
            throw new BusinessRuleException("No pude abrir ese Word. Guárdalo de nuevo o súbelo como PDF.");
        }
        byte[] doc = parts.get("word/document.xml");
        byte[] rels = parts.get("word/_rels/document.xml.rels");
        if (doc == null || rels == null) {
            throw new BusinessRuleException("No pude abrir ese Word. Guárdalo de nuevo o súbelo como PDF.");
        }
        Map<String, String> targets = new HashMap<>();
        Matcher r = REL.matcher(new String(rels, StandardCharsets.UTF_8));
        while (r.find()) {
            Map<String, String> attrs = new HashMap<>();
            Matcher a = ATTR.matcher(r.group());
            while (a.find()) {
                attrs.put(a.group(1), a.group(2));
            }
            if (attrs.containsKey("Id") && attrs.containsKey("Target")) {
                targets.put(attrs.get("Id"), "word/" + attrs.get("Target").replaceFirst("^/?word/", ""));
            }
        }
        Set<String> ordered = new LinkedHashSet<>();
        Matcher m = EMBED.matcher(new String(doc, StandardCharsets.UTF_8));
        while (m.find()) {
            String target = targets.get(m.group(1));
            if (target != null) {
                ordered.add(target);
            }
        }
        List<byte[]> images = new ArrayList<>();
        for (String path : ordered) {
            byte[] img = parts.get(path);
            if (img != null && (InvoiceScanService.isJpeg(img) || InvoiceScanService.isPng(img))) {
                images.add(img);
            }
        }
        return images;
    }
}
