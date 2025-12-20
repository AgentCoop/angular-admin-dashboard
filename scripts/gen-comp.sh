#!/usr/bin/env bash
set -e

# -----------------------------
# Usage check
# -----------------------------
if [ -z "$1" ]; then
  echo "❌ Usage: ./gen-comp.sh <component-path>"
  exit 1
fi

COMP_PATH="$1"
BASENAME="$(basename "$COMP_PATH")"

# Convert kebab/snake/etc to PascalCase
CLASS_NAME="$(echo "$BASENAME" \
  | sed 's/[^a-zA-Z0-9]/ /g' \
  | sed 's/\b\(.\)/\u\1/g' \
  | sed 's/ //g')"

# -----------------------------
# Create directories & files
# -----------------------------
mkdir -p "$COMP_PATH"

HTML_FILE="$COMP_PATH/$BASENAME.component.html"
SCSS_FILE="$COMP_PATH/$BASENAME.component.scss"
TS_FILE="$COMP_PATH/$BASENAME.component.ts"

touch "$HTML_FILE" "$SCSS_FILE"

# -----------------------------
# Generate TypeScript component
# -----------------------------
cat > "$TS_FILE" <<EOF
import { Component } from '@angular/core';

@Component({
  selector: 'app-$BASENAME',
  templateUrl: './$BASENAME.component.html',
  styleUrls: ['./$BASENAME.component.scss']
})
export class ${CLASS_NAME}Component {
  constructor() {}
}
EOF

# -----------------------------
# Output
# -----------------------------
echo "Created: $TS_FILE"
echo "Created: $HTML_FILE"
echo "Created: $SCSS_FILE"
