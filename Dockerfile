# ---- Deps ----
FROM --platform=linux/amd64 groupclaes/npm AS depedencies

# change the working directory to new exclusive app folder
WORKDIR /usr/src/app

# copy package file
COPY package.json ./

# install node packages
RUN npm install --omit=dev


# ---- Build ----
FROM depedencies AS build

# copy project
COPY ./ ./

# install node packages
RUN npm install

# create esbuild package
RUN esbuild ./index.ts --bundle --platform=node --minify --packages=external --external:'./config' --outfile=index.min.js


# --- release ---
FROM --platform=linux/amd64 groupclaes/node AS release

# font assets
COPY ./assets ./
RUN mkdir -p /usr/share/fonts/truetype/
RUN install -m644 nunito.ttf /usr/share/fonts/truetype/
RUN rm ./nunito.ttf

# add lib form pdf and image manipulation
USER root
RUN apk add --no-cache file imagemagick

# set current user to node
USER node

# change the working directory to new exclusive app folder
WORKDIR /usr/src/app

# copy dependencies and assets
COPY --chown=node:node --from=depedencies /usr/src/app ./
COPY --chown=node:node src/assets/ ./assets/

# copy project file
COPY --chown=node:node --from=build /usr/src/app/index.min.js ./


# command to run when intantiate an image
CMD ["node","index.min.js"]