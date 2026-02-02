# syntax=docker/dockerfile:1.4

FROM node:20-alpine AS ui-builder

WORKDIR /ui

COPY ui/package.json ui/pnpm-lock.yaml ./

RUN corepack enable && pnpm install --frozen-lockfile

COPY ui ./

RUN pnpm build

FROM eclipse-temurin:21-jdk AS builder

WORKDIR /workspace

COPY mvnw mvnw
COPY .mvn .mvn
COPY pom.xml pom.xml

RUN chmod +x mvnw

RUN --mount=type=cache,id=maven-repo,target=/root/.m2 \
    ./mvnw -DskipTests dependency:go-offline

COPY src src

COPY --from=ui-builder /ui/dist ui/dist

RUN --mount=type=cache,id=maven-repo,target=/root/.m2 \
    ./mvnw -DskipTests package && \
    JAR_FILE="$(ls -1 target/*.jar | grep -v '\\.original$' | head -n 1)" && \
    cp "$JAR_FILE" /workspace/app.jar

FROM eclipse-temurin:21-jre

WORKDIR /app

ENV JAVA_TOOL_OPTIONS="-XX:+UseShenandoahGC -XX:ShenandoahGCHeuristics=compact"

COPY --from=builder /workspace/app.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
