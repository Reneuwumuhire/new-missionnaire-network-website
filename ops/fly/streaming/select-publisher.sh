#!/bin/sh
set -eu

publishers_to_kick() {
	jq -r '
		[.items[]? | select(.state == "publish" and (.id | type) == "string")]
		| sort_by(.created, .id)
		| if length < 2 then empty else .[0:-1][].id end
	'
}

list_publishers() {
	page=0
	pages=""
	while :; do
		response="$(curl --retry 3 --retry-all-errors --retry-delay 1 -fsS \
			"http://127.0.0.1:9997/v3/rtmpconns/list?page=${page}&itemsPerPage=100")" || return 1
		page_count="$(printf '%s' "$response" | jq -er '.pageCount | numbers')" || return 1
		pages="${pages}${response}"
		page=$((page + 1))
		[ "$page" -ge "$page_count" ] && break
	done
	printf '%s' "$pages" | jq -sc '{items: [.[].items[]?]}'
}

if [ "${1:-}" = "--select" ]; then
	publishers_to_kick
	exit
fi

[ "${MTX_SOURCE_TYPE:-}" = "rtmpConn" ] || exit 0
payload="$(list_publishers)" || exit 0
publisher_ids="$(printf '%s' "$payload" | publishers_to_kick)" || exit 1

printf '%s\n' "$publisher_ids" | while IFS= read -r id; do
	case "$id" in
	'' | *[!0-9a-fA-F-]*) continue ;;
	esac
	if curl -fsS -X POST "http://127.0.0.1:9997/v3/rtmpconns/kick/${id}" >/dev/null; then
		echo "[stream] disconnected an older publisher; newest Studio is now active"
	fi
done
