package com.poshibrido.access;

import com.poshibrido.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pruebas de seguridad (decisión 276): todo endpoint de negocio declara su permiso con {@code @PreAuthorize} (en el
 * método o en la clase). Una acción nueva sin permiso deja pasar a cualquier miembro del negocio, por ejemplo a un
 * cajero; esta prueba lo detecta al compilar el cambio, no en producción.
 * <p>
 * Excepciones: las rutas de plataforma y de sesión (login, negocios del usuario, invitaciones, ubicaciones) se
 * protegen por la ruta en {@code SecurityConfig}; la consola de plataforma exige administrador por la ruta.
 */
class EndpointPermissionsIT extends IntegrationTest {

    private static final List<String> SESSION_PREFIXES = List.of(
            "/api/v1/auth/", "/api/v1/tenants", "/api/v1/invitations/", "/api/v1/locations/", "/api/v1/platform/");

    /**
     * Revisados uno por uno: lecturas que cualquier miembro necesita (encabezado del negocio, tipo y módulos, estado
     * de la suscripción sin datos de pago) y el cambio de tipo y módulos, que el servicio permite solo al dueño.
     */
    private static final Set<String> OPEN_TO_MEMBERS = Set.of(
            "[GET] /api/v1/branding", "[GET] /api/v1/branding/header",
            "[GET] /api/v1/business-profile", "[PUT] /api/v1/business-profile",
            "[GET] /api/v1/subscription");

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping mapping;

    @Test
    void everyBusinessEndpointDeclaresItsPermission() {
        List<String> missing = new ArrayList<>();
        for (Map.Entry<RequestMappingInfo, HandlerMethod> e : mapping.getHandlerMethods().entrySet()) {
            HandlerMethod handler = e.getValue();
            for (String pattern : e.getKey().getPatternValues()) {
                if (!pattern.startsWith("/api/v1/") || SESSION_PREFIXES.stream().anyMatch(pattern::startsWith)) {
                    continue;
                }
                boolean declared = AnnotatedElementUtils.hasAnnotation(handler.getMethod(), PreAuthorize.class)
                        || AnnotatedElementUtils.hasAnnotation(handler.getBeanType(), PreAuthorize.class);
                String id = e.getKey().getMethodsCondition().getMethods() + " " + pattern;
                if (!declared && !OPEN_TO_MEMBERS.contains(id)) {
                    missing.add(id + " -> " + handler.getBeanType().getSimpleName() + "." + handler.getMethod().getName());
                }
            }
        }
        assertThat(missing).as("Endpoints de negocio sin @PreAuthorize").isEmpty();
    }
}
