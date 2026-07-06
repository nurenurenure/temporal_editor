package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"sync"
	"time"

	"go.temporal.io/sdk/client"
	"gopkg.in/yaml.v3"

	"temporal_editor/internal/database"
	"temporal_editor/internal/models"
	"temporal_editor/internal/validator"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	workflowservice "go.temporal.io/api/workflowservice/v1"
)

var temporalClient client.Client
var workflowDir = "/app/workflows"

var (
	workerCmd *exec.Cmd
	mu        sync.Mutex
)

func restartZigflowWorker() {
	mu.Lock()
	defer mu.Unlock()

	fmt.Println("🔄 Перезапуск Zigflow Worker...")

	hostWorkflowDir := os.Getenv("HOST_WORKFLOWS_DIR")
	if hostWorkflowDir == "" {
		hostWorkflowDir = "./workflows"
	}
	exec.Command("docker", "rm", "-f", "zigflow-worker").Run()

	workerCmd = exec.Command(
		"docker",
		"run",
		"--rm",
		"--name", "zigflow-worker",
		"--network", "local-temporal-network",
		"-v", fmt.Sprintf("%s:/app/workflows", hostWorkflowDir),
		"ghcr.io/zigflow/zigflow",
		"run",
		"--file", "",
		"--dir", "/app/workflows",
		"--temporal-address", "temporal:7233",
	)

	workerCmd.Stdout = os.Stdout
	workerCmd.Stderr = os.Stderr

	if err := workerCmd.Start(); err != nil {
		fmt.Printf("❌ Ошибка запуска Zigflow: %v\n", err)
		return
	}

	go func() {
		if err := workerCmd.Wait(); err != nil {
			fmt.Printf("Zigflow завершился: %v\n", err)
		}
	}()

	fmt.Println("🚀 Zigflow Worker успешно запущен")
}

func getAllWorkflowsHandler(w http.ResponseWriter, r *http.Request) {
	workflows, err := database.GetAllWorkflows()
	if err != nil {
		log.Printf("Ошибка получения списка воркфлоу: %v", err)
		http.Error(w, "Ошибка сервера", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(workflows)
}

func updateWorkflowHandler(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "ID не указан", http.StatusBadRequest)
		return
	}

	var wf models.Workflow
	if err := json.NewDecoder(r.Body).Decode(&wf); err != nil {
		http.Error(w, "Ошибка чтения JSON", http.StatusBadRequest)
		return
	}

	// 1. Валидация шагов
	if err := validator.ValidateSteps(wf.Steps); err != nil {
		http.Error(w, "Ошибка валидации: "+err.Error(), http.StatusBadRequest)
		return
	}

	// 2. Обновляем в БД
	if err := database.UpdateWorkflow(id, &wf); err != nil {
		http.Error(w, "Ошибка обновления в БД: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var doSteps []map[string]interface{}

	for _, step := range wf.Steps {
		doSteps = append(doSteps,
			map[string]interface{}{
				step.Name: step.Body,
			},
		)
	}

	yamlObj := models.ZigflowConfig{
		Document: models.Document{
			DSL:          "1.0.0",
			TaskQueue:    "zigflow",
			WorkflowType: "custom-wf-" + id, // Используем id из URL
			Version:      "0.0.1",
			Title:        wf.Name,
			Summary:      wf.Description,
		},
		Do: doSteps,
	}

	yamlData, err := yaml.Marshal(&yamlObj)
	if err != nil {
		http.Error(w, "Ошибка генерации YAML", http.StatusInternalServerError)
		return
	}

	yamlPath := fmt.Sprintf("/app/workflows/%s.yaml", id)
	if err := os.WriteFile(yamlPath, yamlData, 0644); err != nil {
		http.Error(w, "Ошибка перезаписи файла: "+err.Error(), http.StatusInternalServerError)
		return
	}
	go restartZigflowWorker()

	// 4. Отдаем успешный ответ
	wf.ID = id // Гарантируем, что ID в ответе правильный
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"message":   "Воркфлоу успешно обновлен",
		"id":        id,
		"yaml_file": yamlPath,
	})
}

func runWorkflowHandler(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	// 1. Читаем Payload (данные для цикла) из тела запроса
	var payload models.WorkflowPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Ошибка чтения данных: "+err.Error(), http.StatusBadRequest)
		return
	}

	workflowOptions := client.StartWorkflowOptions{
		ID:        "wf-" + id + "-" + fmt.Sprint(time.Now().Unix()),
		TaskQueue: "zigflow",
	}

	workflowType := "custom-wf-" + id

	// Передаем map, где ключ "data" соответствует ожиданию в YAML
	inputData := map[string]interface{}{
		"data": payload.Data,
	}

	we, err := temporalClient.ExecuteWorkflow(
		context.Background(),
		workflowOptions,
		workflowType,
		inputData,
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

func getRunDetailsHandler(w http.ResponseWriter, r *http.Request) {
	workflowID := r.PathValue("workflowId")
	runID := r.PathValue("runId")

	resp, err := temporalClient.WorkflowService().DescribeWorkflowExecution(
		context.Background(),
		&workflowservice.DescribeWorkflowExecutionRequest{
			Namespace: "default",
			Execution: &commonpb.WorkflowExecution{
				WorkflowId: workflowID,
				RunId:      runID,
			},
		},
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	info := resp.WorkflowExecutionInfo
	result := map[string]any{
		"workflow_id":    info.Execution.WorkflowId,
		"run_id":         info.Execution.RunId,
		"workflow_type":  info.Type.Name,
		"status":         workflowStatusToString(info.Status),
		"history_length": info.HistoryLength,
	}

	if info.StartTime != nil {
		result["start_time"] = info.StartTime.AsTime().UTC().Format(time.RFC3339)
	}

	if info.CloseTime != nil {
		result["close_time"] = info.CloseTime.AsTime().UTC().Format(time.RFC3339)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
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
		doSteps = append(doSteps,
			map[string]interface{}{
				step.Name: step.Body,
			},
		)
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
	yamlPath := fmt.Sprintf("%s/%s.yaml", workflowDir, wf.ID)
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
	go restartZigflowWorker()

}

// getWorkflowHistoryHandler возвращает историю событий выполнения workflow
func getWorkflowHistoryHandler(w http.ResponseWriter, r *http.Request) {
	workflowID := r.PathValue("workflowId")
	runID := r.PathValue("runId")

	iter := temporalClient.GetWorkflowHistory(
		context.Background(),
		workflowID,
		runID,
		false, // не ждать новые события
		enumspb.HISTORY_EVENT_FILTER_TYPE_ALL_EVENT,
	)

	var events []map[string]interface{}
	for iter.HasNext() {
		event, err := iter.Next()
		if err != nil {
			http.Error(w, "Ошибка чтения истории: "+err.Error(), http.StatusInternalServerError)
			return
		}
		events = append(events, map[string]interface{}{
			"eventId":   event.EventId,
			"timestamp": event.EventTime.AsTime().UTC().Format(time.RFC3339),
			"type":      event.EventType.String(),
			// Можно добавить детали в зависимости от типа события
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"events": events,
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

// Удаление воркфлоу
func deleteWorkflowHandler(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "ID не указан", http.StatusBadRequest)
		return
	}

	// 1. Удаляем запись из БД
	if err := database.DeleteWorkflow(id); err != nil {
		log.Printf("Ошибка удаления из БД: %v", err)
		http.Error(w, "Не удалось удалить воркфлоу: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 2. Удаляем YAML-файл
	yamlPath := fmt.Sprintf("/app/workflows/%s.yaml", id)
	if err := os.Remove(yamlPath); err != nil && !os.IsNotExist(err) {
		log.Printf("Ошибка удаления файла %s: %v", yamlPath, err)
		// Файл может отсутствовать – это не критично, но логируем
	}

	// 3. Перезапускаем Zigflow Worker, чтобы он перечитал директорию workflows
	go restartZigflowWorker()

	// 4. Ответ об успешном удалении
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Воркфлоу успешно удалён",
	})
}
func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*") // В проде лучше указать конкретный домен
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func workflowStatusToString(status enumspb.WorkflowExecutionStatus) string {
	switch status {
	case enumspb.WORKFLOW_EXECUTION_STATUS_RUNNING:
		return "RUNNING"
	case enumspb.WORKFLOW_EXECUTION_STATUS_COMPLETED:
		return "COMPLETED"
	case enumspb.WORKFLOW_EXECUTION_STATUS_FAILED:
		return "FAILED"
	case enumspb.WORKFLOW_EXECUTION_STATUS_TERMINATED:
		return "TERMINATED"
	case enumspb.WORKFLOW_EXECUTION_STATUS_TIMED_OUT:
		return "TIMED_OUT"
	case enumspb.WORKFLOW_EXECUTION_STATUS_CANCELED:
		return "CANCELED"
	case enumspb.WORKFLOW_EXECUTION_STATUS_CONTINUED_AS_NEW:
		return "CONTINUED_AS_NEW"
	default:
		return status.String()
	}
}

func mustConnectDB(connStr string) {
	for {
		err := database.InitDB(connStr)
		if err == nil {
			fmt.Println("Postgres connected")
			return
		}

		fmt.Println("DB not ready, retry in 3s:", err)
		time.Sleep(3 * time.Second)
	}
}

func mustConnectTemporal() client.Client {
	for i := 0; i < 30; i++ {
		c, err := client.Dial(client.Options{
			HostPort: "temporal:7233",
		})
		if err == nil {
			fmt.Println("Temporal connected")
			return c
		}

		fmt.Println("Temporal not ready, retry in 2s:", err)
		time.Sleep(2 * time.Second)
	}

	log.Fatal("Temporal unavailable after retries")
	return nil
}
func main() {
	// Инициализируем базу данных
	connStr := "host=postgresql port=5432 user=temporal password=temporal dbname=temporal sslmode=disable"
	mustConnectDB(connStr)
	temporalClient = mustConnectTemporal()
	defer temporalClient.Close() // Закрываем глобальный клиент при выходе
	fmt.Println("Успешное подключение к Temporal!")
	go restartZigflowWorker()

	//Настройка маршрутов
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/workflows", createWorkflowHandler)
	mux.HandleFunc("GET /api/workflows/{id}", getWorkflowHandler)
	mux.HandleFunc("POST /api/workflows/{id}/run", runWorkflowHandler)
	mux.HandleFunc("GET /api/workflows", getAllWorkflowsHandler)
	mux.HandleFunc("PUT /api/workflows/{id}", updateWorkflowHandler)
	mux.HandleFunc("GET /api/runs/{workflowId}/{runId}", getRunDetailsHandler)
	mux.HandleFunc("DELETE /api/workflows/{id}", deleteWorkflowHandler)
	mux.HandleFunc("GET /api/runs/{workflowId}/{runId}/history", getWorkflowHistoryHandler)
	fmt.Println("Сервер запущен на http://localhost:8080")
	if err := http.ListenAndServe(":8080", enableCORS(mux)); err != nil {
		log.Fatal("Ошибка сервера:", err)
	}
}
