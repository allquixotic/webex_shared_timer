#!/usr/bin/env bash
set -e
pushd client
bun install
bun build index.js --outdir ../static --target browser --minify
popd
pushd server
bun install 
popd
bun run --bun --hot server/index.js