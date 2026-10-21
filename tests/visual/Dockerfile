FROM node:22.16.0-bookworm-slim@sha256:1471ea646673136b8308550ac14b36d847ffb21c24bc31828279e443c924e488
# Freeze Debian dependencies, including font files, rather than using today's mirror.
RUN rm -f /etc/apt/sources.list.d/debian.sources && \
    printf 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20250615T000000Z bookworm main\n' > /etc/apt/sources.list && \
    apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates xvfb xauth fonts-dejavu-core libgtk-3-0 libnss3 libasound2 \
    libgbm1 libxss1 libxshmfence1 libxtst6 libx11-xcb1 libdrm2 libsecret-1-0 && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
RUN node --input-type=module -e "import { downloadAndUnzipVSCode } from '@vscode/test-electron'; await downloadAndUnzipVSCode('1.142.0');"
COPY . .
RUN npm run build && ./node_modules/.bin/esbuild tests/visual/index.ts --bundle --platform=node --format=cjs --target=node20 --external:vscode --outfile=dist/visual/index.cjs
ENV MIC_VISUAL_ENVIRONMENT=debian-bookworm-20250615-node22.16-vscode1.142.0-x64
ENV LANG=C.UTF-8 TZ=UTC
ENTRYPOINT ["xvfb-run", "-a", "-s", "-screen 0 1280x900x24", "node", "scripts/run-visual.mjs"]
