package com.poshibrido.ai.application;

import com.poshibrido.purchasing.application.AiProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** La API de Anthropic con un reintento ante saturación o errores del servidor (decisión 298). */
class AnthropicMessagesTest {

    @Test
    void retriesOnceWhenTheServiceIsBusyButNotOnBadRequests() throws Exception {
        AtomicInteger busyCalls = new AtomicInteger();
        AtomicInteger badCalls = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/ocupado", ex -> {
            if (busyCalls.incrementAndGet() == 1) {
                ex.sendResponseHeaders(529, -1);
            } else {
                byte[] out = "{\"stop_reason\":\"end_turn\",\"content\":[]}".getBytes(StandardCharsets.UTF_8);
                ex.sendResponseHeaders(200, out.length);
                ex.getResponseBody().write(out);
            }
            ex.close();
        });
        server.createContext("/mal", ex -> {
            badCalls.incrementAndGet();
            ex.sendResponseHeaders(400, -1);
            ex.close();
        });
        server.start();
        try {
            String base = "http://127.0.0.1:" + server.getAddress().getPort();
            AiProperties props = new AiProperties("k", null, 10);
            Map<String, Object> ok = new AnthropicMessages(props, HttpClient.newHttpClient(), URI.create(base + "/ocupado"))
                    .send(Map.of("model", "m"));
            assertThat(ok.get("stop_reason")).isEqualTo("end_turn");
            assertThat(busyCalls.get()).isEqualTo(2);
            assertThatThrownBy(() -> new AnthropicMessages(props, HttpClient.newHttpClient(), URI.create(base + "/mal"))
                    .send(Map.of("model", "m"))).isInstanceOf(AnthropicMessages.AiUnavailableException.class);
            assertThat(badCalls.get()).isEqualTo(1);
        } finally {
            server.stop(0);
        }
        assertThat(AnthropicMessages.retryable(529)).isTrue();
        assertThat(AnthropicMessages.retryable(401)).isFalse();
    }
}
