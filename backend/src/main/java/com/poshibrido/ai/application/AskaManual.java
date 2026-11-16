package com.poshibrido.ai.application;

import tools.jackson.core.type.TypeReference;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * El manual de uso para Aska (decisión 357): las secciones de {@code frontend/src/app/features/manual/manual-content.ts}
 * exportadas a {@code aska/manual.json} con {@code npm run export:manual} (CI revisa que esté al día). Busca por
 * palabras, sin tildes ni mayúsculas, y devuelve las 3 secciones que más coinciden.
 */
@Component
public class AskaManual {

    static final String BASE_URL = "https://app.xaska.co/manual#";

    /** Una sección del manual, como la exporta el frontend. */
    public record Section(String id, String chapter, String title, String summary, List<String> steps,
                          List<String> tips, String who) {
    }

    private static final Set<String> STOP = Set.of("como", "hago", "hacer", "para", "que", "una", "uno", "unos",
            "unas", "los", "las", "del", "con", "por", "puedo", "quiero", "donde", "cual", "esta", "este", "mis", "mi",
            "tu", "se", "el", "la", "lo", "de", "en", "y", "o", "a", "al", "un", "es", "me", "le", "xaska");

    private final List<Section> sections;

    public AskaManual() {
        this(load());
    }

    AskaManual(List<Section> sections) {
        this.sections = List.copyOf(sections);
    }

    private static List<Section> load() {
        ClassPathResource resource = new ClassPathResource("aska/manual.json");
        if (!resource.exists()) {
            return List.of();
        }
        try (InputStream in = resource.getInputStream()) {
            return AnthropicMessages.JSON.readValue(in, new TypeReference<List<Section>>() { });
        } catch (IOException ex) {
            throw new UncheckedIOException("No se pudo leer aska/manual.json", ex);
        }
    }

    public int size() {
        return sections.size();
    }

    /** Las secciones que mejor responden a lo que la persona quiere hacer. */
    public Object search(String query) {
        if (query == null || query.isBlank()) {
            throw new IllegalArgumentException("Falta qué buscar en el manual.");
        }
        List<String> words = words(query);
        if (words.isEmpty() || sections.isEmpty()) {
            return "El manual no tiene nada sobre \"" + query + "\".";
        }
        record Scored(Section section, int score) {
        }
        List<Scored> scored = new ArrayList<>();
        for (Section s : sections) {
            String title = normalize(s.title());
            String body = normalize(s.summary() + " " + String.join(" ", nonNull(s.steps())) + " "
                    + String.join(" ", nonNull(s.tips())));
            int score = 0;
            for (String w : words) {
                if (title.contains(w)) {
                    score += 5;
                }
                if (body.contains(w)) {
                    score += 1;
                }
            }
            if (score > 0) {
                scored.add(new Scored(s, score));
            }
        }
        if (scored.isEmpty()) {
            return "El manual no tiene nada sobre \"" + query + "\". Dile a la persona que lo busque en "
                    + "https://app.xaska.co/manual o que escriba a soporte.";
        }
        scored.sort(Comparator.comparingInt(Scored::score).reversed());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Scored sc : scored.subList(0, Math.min(3, scored.size()))) {
            Section s = sc.section();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("capitulo", s.chapter());
            m.put("titulo", s.title());
            m.put("resumen", s.summary());
            m.put("pasos", nonNull(s.steps()));
            m.put("consejos", nonNull(s.tips()));
            if (s.who() != null) {
                m.put("quienPuede", s.who());
            }
            m.put("enlace", BASE_URL + s.id());
            out.add(m);
        }
        return out;
    }

    static List<String> words(String text) {
        List<String> out = new ArrayList<>();
        for (String w : normalize(text).split("[^a-z0-9]+")) {
            if (w.length() >= 3 && !STOP.contains(w)) {
                // Raíz sencilla: "anular", "anulo" y "anulacion" coinciden en "anul".
                out.add(w.length() >= 5 ? w.substring(0, Math.max(4, w.length() - 2)) : w);
            }
        }
        return out;
    }

    static String normalize(String text) {
        if (text == null) {
            return "";
        }
        String n = Normalizer.normalize(text.toLowerCase(java.util.Locale.ROOT), Normalizer.Form.NFD);
        return n.replaceAll("\\p{M}", "");
    }

    private static List<String> nonNull(List<String> list) {
        return list == null ? List.of() : list;
    }
}
