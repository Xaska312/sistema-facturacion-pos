package com.poshibrido;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PosHibridoApplication {

    public static void main(String[] args) {
        SpringApplication.run(PosHibridoApplication.class, args);
    }
}
