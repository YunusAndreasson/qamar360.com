#!/usr/bin/env bash
# Make one photograph for the site with Codex's image tool (web/art/, web/AGENTS.md).
#
#   codex-image.sh new  <out.png> <prompt-file> [reference.png ...]
#   codex-image.sh edit <out.png> <prompt-file> <source.png> [reference.png ...]
#
# `new` renders a scene from the prompt, with any images as references; `edit` changes the first
# image as the prompt says. Both add the set's shared style (web/art/prompts/style.txt). Codex saves
# its render under ~/.codex and is told to copy it to <out.png>; its last message lands beside it as
# <out>.log. A render is never used raw: grade it (scripts/grade-photo.py) and set it beside the
# photographs already on the page before anyone judges it.
set -euo pipefail

mode=$1
out=$(realpath -m "$2")
prompt=$(cat "$3")
shift 3
style=$(cat "$(dirname "$0")/../art/prompts/style.txt")
dir=$(dirname "$out")
mkdir -p "$dir"

images=()
for img in "$@"; do images+=(-i "$(realpath "$img")"); done

case $mode in
  new) ask="Use your image generation tool to create ONE photograph. ${prompt} ${style}" ;;
  edit) ask="Use your image generation tool to EDIT the first attached photograph. ${prompt} ${style}" ;;
  *) echo "unknown mode: $mode" >&2; exit 2 ;;
esac

codex exec --skip-git-repo-check --sandbox workspace-write -C "$dir" "${images[@]}" -o "${out%.png}.log" \
  "${ask} When the image is generated, copy the resulting PNG file to exactly ${out} (find it wherever your image tool saved it, for example under ~/.codex/generated_images). Do not crop, resize or post-process it in any way. Do nothing else. Finish by printing the final file path." \
  > "${out%.png}.out" 2>&1 || true

if [[ -f $out ]]; then
  magick identify -format "%f %wx%h\n" "$out"
else
  echo "MISSING $out" >&2
  exit 1
fi
