#!/usr/bin/env bash

# Hook: update-readme-toc.sh
# Automatically generates and updates the table of contents in README.md
# Triggers: After saving README.md

set -euo pipefail

# Only run for README.md
if [[ "${CHANGED_FILE}" != *"README.md" ]]; then
    exit 0
fi

echo "📋 Updating table of contents in README.md..."

# Dynamically determine project root (directory containing .claude/hooks/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
README_PATH="$PROJECT_ROOT/README.md"

# Check if README exists
if [[ ! -f "${README_PATH}" ]]; then
    echo "❌ README.md not found at ${README_PATH}"
    exit 1
fi

# Generate TOC from markdown headers
# Skip level 1 headers (we only want to TOC level 2+)
# Extract headers, format as markdown links with proper indentation
generate_toc() {
    local file="$1"
    local in_code_block=false
    local in_toc_section=false

    while IFS= read -r line; do
        # Track code blocks to skip headers inside them
        if [[ "$line" =~ ^\`\`\` ]]; then
            if $in_code_block; then
                in_code_block=false
            else
                in_code_block=true
            fi
            continue
        fi

        # Skip if we're inside a code block
        if $in_code_block; then
            continue
        fi

        # Track TOC section to exclude it from the TOC itself
        # Trim whitespace for comparison
        local trimmed_line
        trimmed_line=$(echo "$line" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')

        if [[ "$trimmed_line" == "<!-- TOC_START -->" ]]; then
            in_toc_section=true
            continue
        elif [[ "$trimmed_line" == "<!-- TOC_END -->" ]]; then
            in_toc_section=false
            continue
        fi

        # Skip if we're inside the TOC section
        if $in_toc_section; then
            continue
        fi

        # Match headers (## and deeper)
        if [[ "$line" =~ ^(##+)\ (.+)$ ]]; then
            local hashes="${BASH_REMATCH[1]}"
            local title="${BASH_REMATCH[2]}"

            # Skip level 1 headers (single #)
            if [[ ${#hashes} -eq 1 ]]; then
                continue
            fi

            # Skip the TOC header itself
            if [[ "$title" == *"Table of Contents"* ]]; then
                continue
            fi

            local level=$((${#hashes} - 2))  # Subtract 2 to make ## = level 0

            # Create anchor following GitHub's rules:
            # 1. Convert to lowercase
            # 2. Remove emojis and most special chars (keep alphanumeric, spaces, hyphens)
            # 3. Replace spaces with hyphens
            # 4. Remove leading/trailing hyphens and collapse multiple hyphens
            local anchor
            anchor=$(echo "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[`*_~]//g' | sed -E 's/[^a-z0-9 -]//g' | sed -E 's/^ +| +$//g' | tr ' ' '-' | sed -E 's/-+/-/g' | sed -E 's/^-+|-+$//g')

            # Create indentation (2 spaces per level)
            local indent=""
            for ((i=0; i<level; i++)); do
                indent="  ${indent}"
            done

            # Add to TOC
            echo "${indent}- [${title}](#${anchor})"
        fi
    done < "$file"
}

# Generate the new TOC
TOC_FILE=$(mktemp)
generate_toc "${README_PATH}" > "$TOC_FILE"

# Check if TOC is empty
if [[ ! -s "$TOC_FILE" ]]; then
    echo "⚠️  No headers found to generate TOC"
    rm "$TOC_FILE"
    exit 0
fi

# Check if TOC markers exist
if grep -q "<!-- TOC_START -->" "${README_PATH}"; then
    echo "✏️  Updating existing table of contents..."

    # Create temp file with updated TOC
    TEMP_FILE=$(mktemp)
    in_toc=false

    while IFS= read -r line; do
        # Trim whitespace for marker comparison
        trimmed=$(echo "$line" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')

        if [[ "$trimmed" == "<!-- TOC_START -->" ]]; then
            echo "<!-- TOC_START -->"
            cat "$TOC_FILE"
            in_toc=true
        elif [[ "$trimmed" == "<!-- TOC_END -->" ]]; then
            echo "<!-- TOC_END -->"
            in_toc=false
        elif [[ "$in_toc" == false ]]; then
            echo "$line"
        fi
    done < "${README_PATH}" > "$TEMP_FILE"

    mv "$TEMP_FILE" "${README_PATH}"
else
    echo "➕ Adding new table of contents..."

    # Find line number of first ---
    line_num=$(grep -n "^---$" "${README_PATH}" | head -1 | cut -d: -f1)

    if [[ -z "$line_num" ]]; then
        echo "⚠️  Could not find insertion point (---)"
        rm "$TOC_FILE"
        exit 1
    fi

    # Create temp file with TOC inserted
    TEMP_FILE=$(mktemp)
    {
        head -n "$line_num" "${README_PATH}"
        echo ""
        echo "## 📑 Table of Contents"
        echo ""
        echo "<!-- TOC_START -->"
        cat "$TOC_FILE"
        echo "<!-- TOC_END -->"
        echo ""
        echo "---"
        tail -n +$((line_num + 1)) "${README_PATH}"
    } > "$TEMP_FILE"

    mv "$TEMP_FILE" "${README_PATH}"
fi

rm "$TOC_FILE"
echo "✅ Table of contents updated successfully!"

