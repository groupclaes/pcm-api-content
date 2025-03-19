#!/bin/bash
docker_tag="test"
docker_reg="groupclaes"
PACKAGE_VERSION=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g' \
  | tr -d '[[:space:]]')
PACKAGE_NAME=$(cat package.json \
  | grep name \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g' \
  | tr -d '[[:space:]]')

echo "building docker images ${docker_reg}/${PACKAGE_NAME}:${docker_tag}"

docker buildx build --platform=linux/amd64 -t "${docker_reg}/${PACKAGE_NAME}:${docker_tag}" -f Dockerfile --sbom=true --provenance=true --push .