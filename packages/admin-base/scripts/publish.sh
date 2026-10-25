#!/usr/bin/env bash
# Publishes @atakanimo/ata-admin-base to npm (`npm run release`).
# No saved token, or an expired one → `npm login --auth-type=web`: npm prints a URL / opens the browser, the token is
# written to ~/.npmrc after the browser login. `npm publish` runs `prepublishOnly` (typecheck + test + build) first;
# with 2FA, npm asks for the confirmation in the browser too.
set -euo pipefail
cd "$(dirname "$0")/.."

name=$(node -p "require('./package.json').name")
version=$(node -p "require('./package.json').version")

if npm view "$name@$version" version >/dev/null 2>&1; then
  echo "$name@$version zaten npm'de; önce package.json sürümünü artırın." >&2
  exit 1
fi

if ! npm whoami >/dev/null 2>&1; then
  echo "npm oturumu yok ya da token süresi dolmuş; tarayıcıdan giriş açılıyor..."
  npm login --auth-type=web
fi
echo "npm kullanıcısı: $(npm whoami)"

npm publish
# The registry may need a few minutes before the new version is visible; a miss here does not undo the publish.
for _ in 1 2 3 4 5 6; do
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "Yayında: $name@$version"
    exit 0
  fi
  sleep 10
done
echo "Yayınlandı ama $name@$version npm'de henüz görünmüyor; birkaç dakika sonra: npm view $name versions"
