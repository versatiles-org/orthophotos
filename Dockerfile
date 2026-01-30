# Use VersaTiles with GDAL bindings as base image
FROM ghcr.io/versatiles-org/versatiles-gdal:latest

# Install additional system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    rsync \
    openssh-client \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Deno
ENV DENO_INSTALL=/deno
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

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
