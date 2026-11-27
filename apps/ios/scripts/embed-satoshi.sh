#!/bin/sh
# Cache the official distribution locally and embed only the unmodified app font.
set -eu
font="$DERIVED_FILE_DIR/Satoshi-Regular.otf"
if [ ! -s "$font" ]; then
  archive=$(mktemp)
  trap 'rm -f "$archive" "$font.tmp"' EXIT
  curl --fail --silent --show-error --location --retry 2 --max-time 60 https://api.fontshare.com/v2/fonts/download/satoshi -o "$archive"
  unzip -p "$archive" 'Satoshi_Complete/Fonts/OTF/Satoshi-Regular.otf' > "$font.tmp"
  test -s "$font.tmp"
  mv "$font.tmp" "$font"
fi
install -m 644 "$font" "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/Satoshi-Regular.otf"
