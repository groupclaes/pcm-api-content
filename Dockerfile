# ---- deps ----
FROM groupclaes/npm:10 AS depedencies
WORKDIR /usr/src/app

COPY package.json ./package.json
COPY .npmrc ./.npmrc

RUN npm install --omit=dev --ignore-scripts


# ---- build ----
FROM depedencies AS build
COPY index.ts ./index.ts
COPY src/ ./src

RUN npm install --ignore-scripts && npm run build


# ---- final ----
FROM groupclaes/node:20
# add lib form pdf and image manipulation
USER root
RUN apk add --no-cache file imagemagick

# font assets
COPY ./assets ./
RUN mkdir -p /usr/share/fonts/truetype/
RUN install -m644 nunito.ttf /usr/share/fonts/truetype/
RUN rm ./nunito.ttf

# set current user to node
USER node
WORKDIR /usr/src/app

# copy dependencies and assets
COPY src/assets/ ./assets/
COPY --from=depedencies /usr/src/app ./
COPY --from=build /usr/src/app/index.min.js ./

CMD ["node","index.min.js"]