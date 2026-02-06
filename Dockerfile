FROM golang:1.22-alpine AS builder

WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/myapi-backend .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=builder /out/myapi-backend ./myapi-backend

EXPOSE 8000

ENTRYPOINT ["/app/myapi-backend"]
