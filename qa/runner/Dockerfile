FROM mcr.microsoft.com/playwright:focal

# Installs latest Chromium (92) package.

COPY ./qa/runner/package.json /
COPY ./qa/runner/yarn.lock /
RUN yarn install --frozen-lockfile
WORKDIR /runner
ENV PATH="${PATH}:/node_modules/.bin"
