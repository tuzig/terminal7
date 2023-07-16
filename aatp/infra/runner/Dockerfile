FROM mcr.microsoft.com/playwright:v1.22.2-focal 
WORKDIR /app
ENV NODE_PATH="/usr/lib/node_modules"
ADD ./aatp/infra/runner/package.json .
ADD ./aatp/infra/runner/yarn.lock .
ADD ./aatp/infra/runner/playwright.config.ts .
RUN yarn install --frozen-lockfile
RUN mkdir specs
CMD cp /runner/*.spec.ts specs && cp -r /common . && \
    npx playwright test -c /app/playwright.config.ts ${PWARGS} specs/*.spec.ts
