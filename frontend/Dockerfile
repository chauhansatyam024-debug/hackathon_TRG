FROM rust:alpine AS builder

# Install build dependencies for Rust and OpenSSL (needed for lettre/reqwest)
RUN apk add --no-cache musl-dev openssl-dev openssl openssl-libs-static pkgconfig
ENV OPENSSL_STATIC=1

WORKDIR /usr/src/app
COPY . .

# Build release
RUN cargo build --release

FROM alpine:3.18
RUN apk add --no-cache openssl ca-certificates

WORKDIR /app
COPY --from=builder /usr/src/app/target/release/screenshot-graveyard-frontend ./gateway
COPY static/ static/

EXPOSE 3001
CMD ["./gateway"]
