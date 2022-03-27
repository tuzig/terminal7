FROM alpine

# Installs latest Chromium (92) package.
RUN apk add --no-cache chromium
RUN apk add --no-cache \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      nodejs \
      bash \
      yarn

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY ./qa/runner/package.json .
COPY ./qa/runner/yarn.lock .
RUN yarn install --frozen-lockfile
WORKDIR /runner
ENV PATH="${PATH}:/node_modules/.bin"
