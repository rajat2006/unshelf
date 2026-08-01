#!/bin/sh
set -eu

prototype_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
compose_file="$prototype_dir/compose.yml"
example_env="$prototype_dir/example.env"

docker compose --env-file "$example_env" -f "$compose_file" config --quiet

images=$(docker compose --env-file "$example_env" -f "$compose_file" config --images)
image_count=$(printf '%s\n' "$images" | sort -u | wc -l | tr -d ' ')

if [ "$image_count" -ne 2 ]; then
  printf 'expected two distinct images, got %s\n' "$image_count" >&2
  exit 1
fi

printf 'prototype Compose contract is valid (%s distinct images)\n' "$image_count"
