# Imagen del backend (desarrollo y producción).
# La compilación corre en la plataforma de quien construye ($BUILDPLATFORM): el .jar no depende del procesador,
# así GitHub Actions arma la imagen ARM (Hetzner CAX) sin emular Maven.

FROM --platform=$BUILDPLATFORM maven:3-eclipse-temurin-21-alpine AS builder
WORKDIR /app
# Primero solo el pom: las dependencias quedan en una capa que se reutiliza mientras el pom no cambie.
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q clean package -Dmaven.test.skip=true \
    && cp target/*.jar app.jar \
    && java -Djarmode=tools -jar app.jar extract --destination extracted

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S posgroup && adduser -S posuser -G posgroup
# Jar extraído: las librerías (cambian poco) van en una capa aparte del jar de la app (cambia en cada versión),
# así cada actualización en el servidor descarga solo unos cientos de kB.
COPY --from=builder /app/extracted/lib/ ./lib/
COPY --from=builder /app/extracted/app.jar ./app.jar
USER posuser
EXPOSE 8080
# Memoria según el límite del contenedor (no según la RAM del servidor). Se puede cambiar con JAVA_TOOL_OPTIONS.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError"
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
