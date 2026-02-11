FROM node:22-alpine AS frontend-builder

WORKDIR /workspace/frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

FROM golang:1.24-alpine AS backend-builder

WORKDIR /workspace/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
COPY --from=frontend-builder /workspace/frontend/dist ./internal/httpapi/webdist
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/myapi .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=backend-builder /out/myapi ./myapi

EXPOSE 8000

ENTRYPOINT ["/app/myapi"]
