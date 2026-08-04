.PHONY: help install dev lint test test-watch coverage check build clean zip crx keygen icons store-assets site cws-publish release

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

crx: build ## Sign dist/ into a .crx + updates.xml (usage: make crx [KEY=secrets/key.pem])
	node scripts/pack-crx.mjs --key $(or $(KEY),secrets/key.pem)

cws-publish: crx ## Upload + publish the signed crx to the Chrome Web Store (uses secrets/ + cws.json)
	node scripts/cws-publish.mjs "google-country-$(shell node -p "require('./package.json').version").crx"

keygen: ## Generate the crx signing key once → secrets/key.pem (never committed)
	@test ! -f secrets/key.pem || { echo "secrets/key.pem exists — refusing to overwrite"; exit 1; }
	@mkdir -p secrets
	openssl genrsa 2048 > secrets/key.pem && echo "Wrote secrets/key.pem — also store it as the CRX_PRIVATE_KEY secret; keep a backup"

icons: ## Regenerate the placeholder PNG app icons in src/icons/
	node scripts/gen-icons.mjs

store-assets: ## Render the Chrome Web Store listing images into store/ (needs Chrome + sips)
	node scripts/gen-store-assets.mjs

site: ## Build the GitHub Pages promo/privacy/support site into site-dist/ (Vite)
	npm run site

release: ## Bump version, tag vX.Y.Z, push to trigger the release workflow (usage: make release VERSION=1.2.3)
	@test -n "$(VERSION)" || { echo "Usage: make release VERSION=1.2.3"; exit 1; }
	@grep -q "^## \[$(VERSION)\]" CHANGELOG.md || { echo "Add a CHANGELOG.md '## [$(VERSION)]' entry before releasing"; exit 1; }
	npm version $(VERSION) --no-git-tag-version
	git commit -am "chore: release v$(VERSION)" && git tag "v$(VERSION)" && git push && git push --tags
