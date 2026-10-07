package com.poshibrido.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.rate-limit")
public record RateLimitProperties(int loginPerMinute, int registerPerMinute, int apiPerMinute, int heavyPerMinute) {
}
