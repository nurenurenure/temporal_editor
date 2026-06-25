package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"go.temporal.io/sdk/client"
	"gopkg.in/yaml.v3"

	"temporal_editor/internal/database"
	"temporal_editor/internal/models"
)

var temporalClient client.Client

func runWorkflowHandler(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	// 1. Берем данные из БД
	wf, err := database.GetWorkflowByID(id)
	if err != nil {
		http.Error(w, "Workflow не найден", http.StatusNotFound)
		return
	}

	// Настраиваем опции запуска
	workflowOptions := client.StartWorkflowOptions{
		ID:        "wf-" + wf.ID, // Уникальный ID для каждого запуска
		TaskQueue: "zigflow",
	}
	workflowType := "custom-wf-" + wf.ID
	// запуск workflow через sdk
	// wf — это объект, который пойдет как аргумент в воркфлоу
	we, err := temporalClient.ExecuteWorkflow(
		context.Background(),
		workflowOptions,
		workflowType,
		wf, // Передаем данные воркфлоу
	)

	if err != nil {
		http.Error(w, "Ошибка запуска workflow: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Формируем прямую ссылку на Temporal Web UI
	uiURL := fmt.Sprintf("http://localhost:8233/namespaces/default/workflows/%s/%s", we.GetID(), we.GetRunID())

	// Возвращаем результат
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status":          "started",
		"workflow_id":     we.GetID(),
		"run_id":          we.GetRunID(),
		"temporal_ui_url": uiURL,
	})
}

func createWorkflowHandler(w http.ResponseWriter, r *http.Request) {
	var wf models.Workflow

	// Читаем JSON от фронтенда
	if err := json.NewDecoder(r.Body).Decode(&wf); err != nil {
		http.Error(w, "Ошибка чтения JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Сохраняем в БД (чтобы получить ID)
	if err := database.SaveWorkflow(&wf); err != nil {
		http.Error(w, "Ошибка БД: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Формируем структуру для YAML
	var doSteps []map[string]interface{}
	for _, step := range wf.Steps {
		stepMap := map[string]interface{}{
			step.Name: map[string]interface{}{
				step.Action: step.Params,
			},
		}
		doSteps = append(doSteps, stepMap)
	}

	// Создаем структуру для YAML
	yamlObj := models.ZigflowConfig{
		Document: models.Document{
			DSL:          "1.0.0",
			TaskQueue:    "zigflow",
			WorkflowType: "custom-wf-" + wf.ID,
			Version:      "0.0.1",
			Title:        wf.Name,
			Summary:      wf.Description,
		},
		Do: doSteps,
	}

	// Маршалим yamlObj
	yamlData, err := yaml.Marshal(&yamlObj)
	if err != nil {
		http.Error(w, "Ошибка генерации YAML: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Сохраняем файл
	yamlPath := fmt.Sprintf("./workflows/%s.yaml", wf.ID)
	if err := os.WriteFile(yamlPath, yamlData, 0644); err != nil {
		http.Error(w, "Ошибка записи файла: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Ответ фронтенду
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"id":        wf.ID,
		"yaml_file": yamlPath,
		"status":    "created",
	})
}

func getWorkflowHandler(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	log.Printf("1. Получен GET запрос для ID: %s", id)

	if id == "" {
		http.Error(w, "ID не указан", http.StatusBadRequest)
		return
	}

	wf, err := database.GetWorkflowByID(id)
	if err != nil {
		log.Printf("Ошибка БД: %v", err)
		http.Error(w, "Воркфлоу не найден: "+err.Error(), http.StatusNotFound)
		return
	}

	log.Printf("2. Данные из базы: %+v", wf)

	// Превращаем структуру в массив байт (JSON) вручную
	responseBytes, err := json.Marshal(wf)
	if err != nil {
		log.Printf("Ошибка JSON Marshal: %v", err)
		http.Error(w, "Ошибка сборки JSON", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	// Отправляем байты фронтенду
	w.Write(responseBytes)
}

func main() {
	// Инициализируем базу данных
	connStr := "host=localhost port=5432 user=temporal password=temporal dbname=temporal sslmode=disable"
	if err := database.InitDB(connStr); err != nil {
		log.Fatalf("Не удалось подключиться к базе данных: %v", err)
	}
	fmt.Println("Успешное подключение к Postgres!")

	// Инициализируем Temporal Client
	c, err := client.Dial(client.Options{
		HostPort: "localhost:7233",
	})
	if err != nil {
		log.Fatalln("Не удалось создать Temporal client:", err)
	}
	defer c.Close() // Закроем соединение при завершении работы программы
	temporalClient = c
	fmt.Println("Успешное подключение к Temporal!")

	//Настройка маршрутов
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/workflows", createWorkflowHandler)
	mux.HandleFunc("GET /api/workflows/{id}", getWorkflowHandler)
	mux.HandleFunc("POST /api/workflows/{id}/run", runWorkflowHandler)

	//Запуск HTTP сервера
	fmt.Println("Сервер запущен на http://localhost:8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal("Ошибка сервера:", err)
	}
}
