default:
    @just --list

bridge-install:
    cd bridge && npm install

bridge-dev:
    cd bridge && npm run dev

bridge-test:
    cd bridge && npm test
