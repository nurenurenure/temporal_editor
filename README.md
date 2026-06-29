# Как локально запустить Temporal и простой Go Workflow

Документация:

* https://docs.temporal.io
* https://github.com/temporalio/samples-go

---

# Вариант 1. Запуск через Temporal CLI

Установить Temporal CLI:

Window:

```bash
winget install --id Temporal.TemporalCLI --exact
```

Проверить установку:

```bash
temporal --version
```

Запустить локальный сервер:

```bash
temporal server start-dev
```

По умолчанию:

* Temporal Server: localhost:7233
* Web UI: http://localhost:8233

После запуска открыть браузер:

```text
http://localhost:8233
```

---

# Вариант 2. Запуск через Docker

Создать docker-compose.yml:

```yaml
version: "3.8"

services:
  temporal:
    image: temporalio/temporal:latest
    command: server start-dev --ip 0.0.0.0
    ports:
      - "7233:7233"
      - "8233:8233"
```

Запустить:

```bash
docker compose up
```

Проверить UI:

```text
http://localhost:8233
```

---

# Запуск примера Workflow на Go

Клонировать официальный репозиторий:

```bash
git clone https://github.com/temporalio/samples-go.git
cd samples-go
```

Перейти в пример Hello World:

```bash
cd helloworld
```

Установить зависимости:

```bash
go mod download
```

---

# Запуск Worker

В отдельном терминале:

```bash
go run worker/main.go
```

Ожидаемый вывод:

```text
Started Worker.
```

---

# Запуск Workflow

В новом терминале:

```bash
go run starter/main.go
```

Пример вывода:

```text
Workflow execution started
Workflow completed
```

---

# Проверка в Temporal Web UI

Открыть:

```text
http://localhost:8233
```

В разделе Workflows должен появиться Workflow:

```text
HelloWorldWorkflow
```

Можно открыть его и посмотреть:

* Event History
* Workflow ID
* Run ID
* Execution Status

После завершения статус будет:

```text
Completed
```

---

# Проверка через CLI

Список Workflow:

```bash
temporal workflow list
```

Описание Workflow:

```bash
temporal workflow describe \
  --workflow-id <workflow-id>
```

История выполнения:

```bash
temporal workflow show \
  --workflow-id <workflow-id>
```

---

# Результат

Успешно выполнено:

* Поднят локальный Temporal Server.
* Открыт Temporal Web UI.
* Запущен Go Worker.
* Запущен Hello World Workflow из официального примера.
* Workflow отображается в Web UI.
* Статус выполнения — Completed.
