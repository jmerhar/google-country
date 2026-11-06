.PHONY: install dev lint test test-watch coverage check build clean zip crx keygen icons store-assets site cws-publish release

# help, devtools-update, coverage-tooling and devtools-check come from jmerhar/devtools; make
# fetches them on the first run and whenever devtools.toml changes.
.DEFAULT_GOAL := help
DEVTOOLS_FETCH := scripts/devtools-fetch.sh
include .devtools/make/devtools.mk
.devtools/make/devtools.mk: devtools.toml scripts/devtools-fetch.sh
	scripts/devtools-fetch.sh

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

# The coverage summary and gate are shared tooling from jmerhar/coverage, configured by coverage.toml
# and fetched with the rest of the shared tooling, so a local gate enforces exactly what CI does.
coverage: coverage-tooling ## Run tests with coverage and enforce the gate
	npm run test:cov && python3 $(COVERAGE_TOOLING)/coverage-report.py --gate

check: lint test coverage devtools-check ## Lint + test + coverage gate + devtools (gate a commit on this)

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

cws-publish: build ## Upload + publish the signed store crx (no update_url) to the Chrome Web Store
	node scripts/pack-crx.mjs --key secrets/key.pem --no-update --out cws-upload.crx
	node scripts/cws-publish.mjs cws-upload.crx

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
