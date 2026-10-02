package com.poshibrido.identity.application;

import com.poshibrido.identity.domain.User;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Emite access tokens JWT (HS256).
 * <ul>
 *   <li>Plataforma: {@code typ=platform}, sin {@code tid}. Solo sirve para endpoints de plataforma.</li>
 *   <li>Negocio: {@code typ=tenant}, {@code tid} y {@code perms} calculados desde el schema del negocio.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class TokenService {

    public static final String CLAIM_TYPE = "typ";
    public static final String CLAIM_TENANT = "tid";
    public static final String CLAIM_PERMISSIONS = "perms";
    public static final String CLAIM_PLATFORM_ADMIN = "padm";
    public static final String TYPE_PLATFORM = "platform";
    public static final String TYPE_TENANT = "tenant";

    private final JwtEncoder encoder;
    private final AuthProperties properties;

    public IssuedToken platformToken(User user) {
        return encode(baseClaims(user).claim(CLAIM_TYPE, TYPE_PLATFORM));
    }

    public IssuedToken tenantToken(User user, UUID tenantId, List<String> permissions) {
        return encode(baseClaims(user)
                .claim(CLAIM_TYPE, TYPE_TENANT)
                .claim(CLAIM_TENANT, tenantId.toString())
                .claim(CLAIM_PERMISSIONS, List.copyOf(permissions)));
    }

    private JwtClaimsSet.Builder baseClaims(User user) {
        Instant now = Instant.now();
        JwtClaimsSet.Builder builder = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .subject(user.getId().toString())
                .id(UUID.randomUUID().toString())
                .issuedAt(now)
                .expiresAt(now.plus(properties.accessTokenTtl()));
        if (user.isPlatformAdmin()) {
            builder.claim(CLAIM_PLATFORM_ADMIN, true);
        }
        return builder;
    }

    private IssuedToken encode(JwtClaimsSet.Builder builder) {
        JwtClaimsSet claims = builder.build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String value = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        Instant expiresAt = claims.getExpiresAt();
        return new IssuedToken(value, expiresAt, properties.accessTokenTtl().toSeconds());
    }
}
