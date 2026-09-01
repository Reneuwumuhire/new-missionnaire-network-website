#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
actual="$(printf '%s' '{
	"items": [
		{"id":"reader","state":"read","created":"2026-09-01T12:00:00Z"},
		{"id":"11111111-1111-1111-1111-111111111111","state":"publish","created":"2026-09-01T12:00:01Z"},
		{"id":"22222222-2222-2222-2222-222222222222","state":"publish","created":"2026-09-01T12:00:02Z"}
	]
}' | "$SCRIPT_DIR/select-publisher.sh" --select)"

[ "$actual" = "11111111-1111-1111-1111-111111111111" ]
[ -z "$(printf '%s' '{"items":[]}' | "$SCRIPT_DIR/select-publisher.sh" --select)" ]
if printf '%s' '{invalid' | "$SCRIPT_DIR/select-publisher.sh" --select >/dev/null 2>&1; then
	echo "invalid API data unexpectedly passed publisher selection" >&2
	exit 1
fi
echo "publisher selection tests passed"
