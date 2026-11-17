package com.poshibrido.whatsapp.api;

import com.poshibrido.ai.application.AnthropicMessages;
import com.poshibrido.whatsapp.application.WhatsAppInbound;
import com.poshibrido.whatsapp.application.WhatsAppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;

/**
 * Webhook de la plataforma de WhatsApp (decisión 362). Público (SecurityConfig), pero solo acepta avisos firmados
 * con la clave secreta de la app de Meta ({@code X-Hub-Signature-256}). Sin configuración responde 404.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class WhatsAppWebhookController {

    static final String PATH = "/api/v1/public/whatsapp/webhook";

    private final WhatsAppProperties properties;
    private final WhatsAppInbound inbound;

    /** Meta comprueba el webhook al registrarlo: devuelve el reto si el token coincide. */
    @GetMapping(value = PATH, produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> verify(@RequestParam(name = "hub.mode", required = false) String mode,
                                         @RequestParam(name = "hub.verify_token", required = false) String token,
                                         @RequestParam(name = "hub.challenge", required = false) String challenge) {
        if (!properties.receives()) {
            return ResponseEntity.notFound().build();
        }
        if ("subscribe".equals(mode) && token != null && equal(token.getBytes(StandardCharsets.UTF_8),
                properties.verifyToken().getBytes(StandardCharsets.UTF_8)) && challenge != null) {
            return ResponseEntity.ok(challenge);
        }
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @PostMapping(PATH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<Void> receive(@RequestBody(required = false) byte[] body,
                                        @RequestHeader(name = "X-Hub-Signature-256", required = false) String signature) {
        if (!properties.receives()) {
            return ResponseEntity.notFound().build();
        }
        if (body == null || !validSignature(body, signature, properties.appSecret())) {
            log.warn("Aviso de WhatsApp con firma inválida: se ignora");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            inbound.accept(AnthropicMessages.JSON.readValue(body, Map.class));
        } catch (RuntimeException ex) {
            log.warn("Aviso de WhatsApp que no se pudo leer: {}", ex.getMessage());
        }
        // Siempre 200 a un aviso firmado: si no, Meta lo reenvía una y otra vez.
        return ResponseEntity.ok().build();
    }

    static boolean validSignature(byte[] body, String header, String secret) {
        if (header == null || !header.startsWith("sha256=") || secret == null || secret.isBlank()) {
            return false;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] expected = mac.doFinal(body);
            byte[] given = HexFormat.of().parseHex(header.substring("sha256=".length()).trim());
            return MessageDigest.isEqual(expected, given);
        } catch (GeneralSecurityException | IllegalArgumentException ex) {
            return false;
        }
    }

    private static boolean equal(byte[] a, byte[] b) {
        return MessageDigest.isEqual(a, b);
    }
}
