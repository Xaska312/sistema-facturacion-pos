package com.poshibrido.config;

import com.poshibrido.audit.application.SecurityEventLogger;
import com.poshibrido.identity.application.TokenService;
import com.poshibrido.tenancy.application.TenantApi;
import com.poshibrido.tenancy.infrastructure.TenantContextFilter;
import jakarta.servlet.DispatcherType;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.util.ArrayList;
import java.util.List;

/**
 * Seguridad stateless con JWT.
 * <ul>
 *   <li>{@code /api/v1/auth/**}, {@code /api/v1/tenants/**}, {@code /api/v1/invitations/**} y
 *       {@code /api/v1/locations/**}: endpoints de plataforma (cualquier sesión).</li>
 *   <li>Resto de {@code /api/v1/**}: endpoints de negocio; exigen token con {@code tid} (si no, 403).</li>
 *   <li>Cada endpoint de negocio declara su permiso con {@code @PreAuthorize}.</li>
 * </ul>
 */
@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
public class SecurityConfig {

    /** Autoridad presente solo en tokens de negocio (con claim {@code tid}). */
    public static final String TENANT_SESSION = "TENANT_SESSION";
    public static final String PLATFORM_ADMIN = "PLATFORM_ADMIN";

    @Bean
    public SecurityFilterChain apiSecurity(HttpSecurity http, JwtDecoder jwtDecoder, TenantApi tenantApi,
                                           RateLimitProperties rateLimits, SecurityEventLogger securityEvents,
                                           @Qualifier("corsConfigurationSource") CorsConfigurationSource corsSource,
                                           @Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver)
            throws Exception {
        AuthenticationEntryPoint entryPoint = (request, response, ex) ->
                resolver.resolveException(request, response, null, ex);
        AccessDeniedHandler deniedHandler = (request, response, ex) ->
                resolver.resolveException(request, response, null, ex);

        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsSource))
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.FORWARD).permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/register", "/api/v1/auth/login",
                                "/api/v1/auth/refresh", "/api/v1/auth/logout").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/invitations/preview").permitAll()
                        .requestMatchers("/api/v1/auth/**", "/api/v1/tenants", "/api/v1/tenants/**",
                                "/api/v1/invitations/**", "/api/v1/locations/**").authenticated()
                        .requestMatchers("/api/v1/platform/**").hasAuthority(PLATFORM_ADMIN)
                        .requestMatchers("/api/v1/**").hasAuthority(TENANT_SESSION)
                        .anyRequest().denyAll())
                .oauth2ResourceServer(oauth -> oauth
                        .jwt(jwt -> jwt.decoder(jwtDecoder).jwtAuthenticationConverter(jwtAuthenticationConverter()))
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(deniedHandler))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(entryPoint)
                        .accessDeniedHandler(deniedHandler))
                .addFilterBefore(new RateLimitFilter(rateLimits, resolver, securityEvents), BearerTokenAuthenticationFilter.class)
                .addFilterAfter(new TenantContextFilter(tenantApi, resolver), AuthorizationFilter.class);
        return http.build();
    }

    /**
     * Autoridades del token: permisos del claim {@code perms}, {@code TENANT_SESSION} si trae
     * {@code tid} y {@code PLATFORM_ADMIN} si trae {@code padm}. Un token de plataforma no trae permisos.
     */
    static Converter<Jwt, AbstractAuthenticationToken> jwtAuthenticationConverter() {
        return jwt -> {
            List<GrantedAuthority> authorities = new ArrayList<>();
            boolean tenantToken = TokenService.TYPE_TENANT.equals(jwt.getClaimAsString(TokenService.CLAIM_TYPE))
                    && jwt.getClaimAsString(TokenService.CLAIM_TENANT) != null;
            if (tenantToken) {
                authorities.add(new SimpleGrantedAuthority(TENANT_SESSION));
                List<String> permissions = jwt.getClaimAsStringList(TokenService.CLAIM_PERMISSIONS);
                if (permissions != null) {
                    permissions.forEach(p -> authorities.add(new SimpleGrantedAuthority(p)));
                }
            }
            if (Boolean.TRUE.equals(jwt.getClaimAsBoolean(TokenService.CLAIM_PLATFORM_ADMIN))) {
                authorities.add(new SimpleGrantedAuthority(PLATFORM_ADMIN));
            }
            return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
        };
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(CorsProperties properties) {
        List<String> origins = properties.allowedOrigins() == null ? List.of() : properties.allowedOrigins();
        if (origins.stream().anyMatch(o -> o.contains("*"))) {
            throw new IllegalStateException("CORS_ALLOWED_ORIGINS no admite comodines");
        }
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id"));
        config.setExposedHeaders(List.of("X-Request-Id", "Retry-After", "Content-Disposition"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
