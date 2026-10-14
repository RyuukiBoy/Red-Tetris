dev:
	pnpm dev
build:
	pnpm build
start:
	pnpm start
test:
	pnpm test
coverage:
	pnpm coverage
lint:
	pnpm lint
up:
	docker compose up --build
down:
	docker compose down
clean:
	-rm -rf dist coverage node_modules
