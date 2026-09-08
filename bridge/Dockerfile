# syntax=docker/dockerfile:1

# One image, one process tree: the bridge (Node) spawns `signal-cli daemon`
# (Java) as a child process, exactly as it does outside Docker. Keeping
# both in the same container means the e.1 process manager (restart,
# backoff, readiness poll) stays the single source of truth.
#
# Build args are pinned here so an upgrade is a one-line diff.
ARG NODE_IMAGE=node:22-bookworm-slim
ARG JRE_IMAGE=eclipse-temurin:25-jre-jammy
ARG SIGNAL_CLI_VERSION=0.14.7

# --- stage: download signal-cli release tarball --------------------------
FROM ${NODE_IMAGE} AS signal-cli
ARG SIGNAL_CLI_VERSION
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/signal-cli-${SIGNAL_CLI_VERSION}.tar.gz" \
      | tar xz -C /opt \
 && mv "/opt/signal-cli-${SIGNAL_CLI_VERSION}" /opt/signal-cli

# --- stage: Java runtime (copied in below, no apt JDK packages needed) ----
FROM ${JRE_IMAGE} AS jre

# --- stage: runtime -------------------------------------------------------
FROM ${NODE_IMAGE}

# qrencode renders the link URI as a terminal QR code (see signal-link.sh).
RUN apt-get update \
 && apt-get install -y --no-install-recommends qrencode \
 && rm -rf /var/lib/apt/lists/*

COPY --from=jre /opt/java/openjdk /opt/java/openjdk
COPY --from=signal-cli /opt/signal-cli /opt/signal-cli
ENV JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/signal-cli/bin:/opt/java/openjdk/bin:${PATH} \
    NODE_ENV=production \
    SIGNAL_CLI_DATA_DIR=/data/signal-cli

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts/signal-link.sh /usr/local/bin/signal-link

# /data is the persistent volume (signal-cli account store now, message
# cache later). Created and chowned in the image so a fresh named volume
# inherits node:node ownership on first mount. signal-cli creates its own
# subdirectory under it.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data

EXPOSE 8787
CMD ["node", "src/index.js"]
