#!/bin/bash

sed -i "s/PASTE_YOUR_GOOGLE_MAPS_API_KEY_HERE/$GOOGLE_MAPS_API_KEY/g" estimate.html

# 5902df04: stamp the client version into index.html so decision_results.version_manifest can carry it.
FV="${VERCEL_GIT_COMMIT_SHA:0:7}"
[ -z "$FV" ] && FV="unbuilt"
sed -i "s/__FRONTEND_VERSION__/$FV/g" index.html
