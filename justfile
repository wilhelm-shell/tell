set windows-shell := ["cmd.exe", "/c"]

default:
    @just --list

bridge-install:
    cd bridge && npm install

bridge-dev:
    cd bridge && npm run dev

bridge-test:
    cd bridge && npm test

client-install:
    cd client && npm install

client-build:
    cd client && npm run build

client-test:
    cd client && npm test

package-client:
    cd client && npm run build && npm run package

deploy-phone:
    powershell -File scripts/deploy-phone.ps1

# --- Docker (bridge + signal-cli in one container) -----------------------

bridge-up:
    docker compose up -d --build

bridge-down:
    docker compose down

bridge-logs:
    docker compose logs -f bridge

# One-time: link the container's signal-cli as a secondary device. Prints a
# QR code to scan with the Signal app. Restart the bridge afterwards so the
# daemon picks up the new account.
signal-link:
    docker compose run --rm --no-deps bridge signal-link
