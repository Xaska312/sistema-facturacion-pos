FROM maven:3-eclipse-temurin-21-alpine AS builder
WORKDIR /app
COPY pom.xml ./
COPY src ./src
RUN mvn clean package -Dmaven.test.skip=true

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S posgroup && adduser -S posuser -G posgroup
USER posuser
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]