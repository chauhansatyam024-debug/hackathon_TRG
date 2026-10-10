FROM alpine:3.18

# Install build dependencies
RUN apk add --no-cache \
    build-base \
    cmake \
    git \
    sqlite-dev \
    sqlite \
    linux-headers \
    asio-dev \
    python3

WORKDIR /app

# Copy source code
COPY CMakeLists.txt .
COPY include/ include/
COPY src/ src/

# Build
RUN mkdir build && cd build && \
    cmake .. && \
    make && \
    rm -rf _deps

EXPOSE 8081

CMD ["./build/task_server"]
