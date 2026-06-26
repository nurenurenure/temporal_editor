# Переменные
ZIGFLOW_DIR := ./cmd/api/workflows
API_DIR     := ./cmd/api
# Прямой путь к бинарнику zigflow в домашней директории Linux
ZIGFLOW_BIN := $(HOME)/go/bin/zigflow

.PHONY: up down run-api run-worker restart-worker

# Запуск инфраструктуры (Temporal + Postgres)
up:
	docker compose up -d

# Остановка инфраструктуры
down:
	docker compose down

# Go API сервера
run-api:
	cd $(API_DIR) && go run main.go

# Запуск воркера Zigflow
run-worker:
	cd $(ZIGFLOW_DIR) && $(ZIGFLOW_BIN) run --dir . --watch

# Перезапуск воркера
restart-worker:
	@echo "Перезапускаем Zigflow worker..."
	-pkill -f "zigflow run" || true
	@make run-worker