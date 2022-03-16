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

RUN wget --quiet https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh -O /usr/sbin/wait-for-it.sh \
     && chmod +x /usr/sbin/wait-for-it.sh
# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY ./bb/runner/package.json .
RUN yarn install --verbose --no-lockfile
WORKDIR /runner
ENV PATH="${PATH}:/node_modules/.bin"
