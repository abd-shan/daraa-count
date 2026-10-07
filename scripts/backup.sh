#!/bin/sh
# Run in the project root with restrictive permissions and a protected destination.
set -eu
umask 077
destination="${1:-./backups}"
mkdir -p "$destination"
filename="$destination/count-daraa-$(date -u +%Y%m%d-%H%M%S)-$$.dump"
set -C
docker compose exec -T db pg_dump -U count_daraa -d count_daraa -Fc > "$filename.partial"
test -s "$filename.partial"
mv "$filename.partial" "$filename"
printf 'Backup created: %s\n' "$filename"
