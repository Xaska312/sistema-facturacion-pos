# Imagen del backend (desarrollo y producción).
# La compilación corre en la plataforma de quien construye ($BUILDPLATFORM): el .jar no depende del procesador,
# así GitHub Actions arma la imagen ARM (Hetzner CAX) sin emular Maven.

FROM --platform=$BUILDPLATFORM maven:3-eclipse-temurin-21-alpine AS builder
WORKDIR /app
# Primero solo el pom: las dependencias quedan en una capa que se reutiliza mientras el pom no cambie.
COPY pom.xml ./
# .mvn/maven.config: Maven reintenta hasta 8 veces una descarga que responde 429 o 503, esperando entre intentos.
COPY .mvn/maven.config ./.mvn/maven.config
# go-offline no baja los procesadores de anotaciones (mapstruct-processor): compilar una clase vacía los trae a esta
# misma capa. Si no, se bajaban de Maven Central en cada versión y un 429 (límite de descargas) tumbaba la imagen.
# Maven Central responde 429 cuando muchas máquinas de GitHub descargan a la vez (la prueba de Playwright arma la
# imagen sin caché): se reintenta hasta 4 veces, esperando 30, 60 y 90 s. Lo ya bajado se conserva entre intentos.
RUN mkdir -p src/main/java && echo 'class Warmup {}' > src/main/java/Warmup.java \
    && ok=; for i in 1 2 3 4; do \
         if mvn -B -q dependency:go-offline && mvn -B -q compile; then ok=1; break; fi; \
         [ "$i" -lt 4 ] && echo "Maven Central no respondió (intento $i); reintentando…" && sleep $((i * 30)); \
       done; [ -n "$ok" ] && rm -rf src target
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
