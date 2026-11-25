#!/bin/sh
input=$(cat)
case "$input" in
  *git* | *[!i]gh* | *file_path* | *bashEditDiff*) ;;
  *) exit 0 ;;
esac
printf '%s' "$input" | node "${0%/*}/guard.mjs"
