package com.poshibrido.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.util.UrlPathHelper;

/**
 * Ruta de la petición tal como la entienden Spring Security y Spring MVC: decodificada ({@code %6C} → {@code l}),
 * sin parámetros de matriz ({@code ;x=1}) y sin "/" final. Los límites de solicitudes deben comparar esta ruta y no
 * {@code getRequestURI()} (sin decodificar): si no, {@code /api/v1/auth/%6Cogin} llegaría al login sin límite
 * (QA SEG-3).
 */
final class RequestPaths {

    private static final UrlPathHelper HELPER = new UrlPathHelper();

    static {
        HELPER.setUrlDecode(true);
        HELPER.setRemoveSemicolonContent(true);
    }

    private RequestPaths() {
    }

    static String normalized(HttpServletRequest request) {
        String path = HELPER.getPathWithinApplication(request);
        while (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        return path;
    }
}
