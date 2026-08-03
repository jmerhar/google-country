.PHONY: help install dev lint test test-watch coverage check build clean zip crx keygen icons release

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*##|^##@' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; /^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next} {printf "  \033[36mmake %-16s\033[0m %s\n", $$1, $$2}'

##@ Setup

install: ## Install dependencies (npm ci when a lockfile exists, else npm install)
	@if [ -f package-lock.json ]; then npm ci; else npm install; fi

##@ Dev

dev: ## Rebuild dist/ on change — then reload the unpacked extension in chrome://extensions
	node scripts/build.mjs --watch

##@ Quality

lint: ## ESLint + TypeScript type-check
	npm run lint && npm run typecheck

test: ## Run the unit test suite
	npm run test

test-watch: ## Run the unit tests in watch mode
	npm run test:watch

coverage: ## Run tests with coverage and enforce the gate
	npm run test:cov && python3 scripts/coverage-report.py --gate

check: lint test coverage ## Lint + test + coverage gate (gate a commit on this)

##@ Build

build: ## Bundle src/ into the loadable extension in dist/
	npm run build

clean: ## Remove build + coverage + package artifacts (all regenerable)
	rm -rf dist coverage coverage-upload *.zip *.crx updates.xml

##@ Package

zip: build ## Package dist/ into google-country-<version>.zip (Load unpacked / Kiwi / CWS)
	cd dist && zip -qr ../google-country-$(shell node -p "require('./package.json').version").zip .

crx: build ## Sign dist/ into a .crx + updates.xml (usage: make crx [KEY=key.pem])
	node scripts/pack-crx.mjs --key $(or $(KEY),key.pem)

keygen: ## Generate the crx signing key once → key.pem (stable extension ID; never commit)
	@test ! -f key.pem || { echo "key.pem exists — refusing to overwrite"; exit 1; }
	openssl genrsa 2048 > key.pem && echo "Wrote key.pem — store as the CRX_PRIVATE_KEY secret; do not commit"

icons: ## Regenerate the placeholder PNG app icons in src/icons/
	node scripts/gen-icons.mjs

release: ## Bump version, tag vX.Y.Z, push to trigger the release workflow (usage: make release VERSION=1.2.3)
	@test -n "$(VERSION)" || { echo "Usage: make release VERSION=1.2.3"; exit 1; }
	npm version $(VERSION) --no-git-tag-version
	git commit -am "chore: release v$(VERSION)" && git tag "v$(VERSION)" && git push && git push --tags
