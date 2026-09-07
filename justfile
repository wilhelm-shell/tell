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
