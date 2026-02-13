FROM node:22-alpine AS frontend-builder

WORKDIR /workspace/frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

FROM eclipse-temurin:21-jdk-alpine AS backend-builder

WORKDIR /workspace/backend
COPY backend-java/gradlew backend-java/settings.gradle backend-java/build.gradle ./
COPY backend-java/gradle ./gradle

COPY backend-java/src ./src
COPY --from=frontend-builder /workspace/frontend/dist ./src/main/resources/static

RUN --mount=type=cache,id=gradle-repo,target=/root/.gradle ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre

WORKDIR /app
COPY --from=backend-builder /workspace/backend/build/libs/*.jar ./app.jar

EXPOSE 8000

ENTRYPOINT ["java","-jar","/app/app.jar"]
