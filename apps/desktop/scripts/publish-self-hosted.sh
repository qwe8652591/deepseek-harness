#!/usr/bin/env bash
# Upload one staged product release (publish:product --output) to the self-hosted release server over SFTP.
# Payloads go first and a published version directory is never rewritten; the platform's channel file goes last,
# through a rename, because it switches clients and download pages to the new version.
# Usage: publish-self-hosted.sh <staging-directory> <version>
# Environment: RELEASES_URL (public directory ending in /), RELEASE_HOST, RELEASE_PORT,
#   RELEASE_SSH_KEY (private key text), RELEASE_KNOWN_HOSTS (known_hosts line), RELEASE_PROFILE (default yunyao),
#   RELEASE_CHANNEL (default stable).
set -euo pipefail
staging=$1 version=$2
profile=${RELEASE_PROFILE:-yunyao} channel=${RELEASE_CHANNEL:-stable}
temp=$(mktemp -d)
key="$temp/release-key" known="$temp/release-known-hosts"
trap 'rm -rf "$temp"' EXIT
printf '%s\n' "$RELEASE_SSH_KEY" > "$key" && chmod 600 "$key"
printf '%s\n' "$RELEASE_KNOWN_HOSTS" > "$known"
sftp_run() { sftp -i "$key" -o UserKnownHostsFile="$known" -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o BatchMode=yes -P "$RELEASE_PORT" -b - "dsh-release@$RELEASE_HOST"; }
version_dir="$profile-v$version" channel_dir="$profile-$channel"
shopt -s nullglob
payloads=("$staging/$version_dir"/*.exe "$staging/$version_dir"/*.zip "$staging/$version_dir"/*.dmg)
channel_files=("$staging/$channel_dir"/*.yml)
[ "${#payloads[@]}" -gt 0 ] || { echo "no installer in $staging/$version_dir"; exit 1; }
[ "${#channel_files[@]}" -eq 1 ] || { echo "expected one channel file in $staging/$channel_dir"; exit 1; }
for file in "${payloads[@]}"; do
  name=$(basename "$file")
  published=$(curl -s -o /dev/null -w '%{http_code}' -I "$RELEASES_URL$version_dir/$name")
  if [ "$published" != 404 ]; then echo "$version_dir/$name is already published (HTTP $published)"; exit 1; fi
done
{ echo "-mkdir releases/$version_dir"
  for file in "$staging/$version_dir"/*; do echo "put \"$file\" \"releases/$version_dir/$(basename "$file")\""; done
} | sftp_run
for file in "${payloads[@]}"; do
  name=$(basename "$file")
  expected=$(wc -c < "$file" | tr -d ' ')
  served=$(curl -sI "$RELEASES_URL$version_dir/$name" | tr -d '\r' | awk 'tolower($1) == "content-length:" { print $2 }')
  if [ "$served" != "$expected" ]; then echo "served $name has $served bytes, expected $expected"; exit 1; fi
done
channel_file=$(basename "${channel_files[0]}")
printf '%s\n' "-mkdir releases/$channel_dir" \
  "put \"${channel_files[0]}\" \"releases/$channel_dir/.$channel_file.new\"" \
  "rename \"releases/$channel_dir/.$channel_file.new\" \"releases/$channel_dir/$channel_file\"" | sftp_run
curl -sf "$RELEASES_URL$channel_dir/$channel_file" | grep -qx "version: $version"
echo "Published $version_dir: $(for file in "${payloads[@]}"; do basename "$file"; done | tr '\n' ' ')"
