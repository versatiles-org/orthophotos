# Build stage for VersaTiles
FROM rust:1.75-slim-bookworm AS versatiles-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

RUN cargo install versatiles

# Main image
FROM debian:bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    rsync \
    openssh-client \
    gdal-bin \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Deno
ENV DENO_INSTALL=/deno
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

# Copy VersaTiles from builder
COPY --from=versatiles-builder /usr/local/cargo/bin/versatiles /usr/local/bin/versatiles

# Set up working directory
WORKDIR /app

# Copy dependency files first for better caching
COPY deno.json deno.lock* ./

# Cache dependencies
RUN deno cache --reload src/server-prepare.ts 2>/dev/null || true

# Copy application code
COPY . .

# Cache all imports
RUN deno cache src/server-prepare.ts src/status-check.ts

# Verify tools are available
RUN versatiles --version && deno --version && gdalinfo --version

# Default command
CMD ["deno", "task", "server"]
