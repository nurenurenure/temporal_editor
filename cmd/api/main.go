package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"gopkg.in/yaml.v3"

	"temporal_editor/internal/database"
	"temporal_editor/internal/models"
)

/*
1. /workflows - список workflow.
2. /workflows/new - создание.
3. /workflows/:id/edit - редактирование.
4. /runs/:id - детали запуска (убедится, что есть АПИ для получения деталей
запуска с temporal).
*/
func createWorkflowHandler(w http.ResponseWriter, r *http.Request) {
	var wf models.Workflow

	// Читаем JSON от фронтенда
	if err := json.NewDecoder(r.Body).Decode(&wf); err != nil {
		http.Error(w, "Ошибка чтения JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Сохраняем в Postgres
	if err := database.SaveWorkflow(&wf); err != nil {
		http.Error(w, "Ошибка БД: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 3. Генерируем YAML
	yamlData, err := yaml.Marshal(&wf)
	if err != nil {
		http.Error(w, "Ошибка генерации YAML", http.StatusInternalServerError)
		return
	}
	fmt.Printf("Успешно сохранен Воркфлоу ID: %s\nYAML:\n%s\n", wf.ID, string(yamlData))

	// 4. Отвечаем фронтенду уже с заполненным ID
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "success",
		"id":      wf.ID,
		"message": "Воркфлоу успешно сохранен",
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

	// Смотрим, что достали из базы
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
	// Строка подключения к базе
	connStr := "host=localhost port=5432 user=temporal password=temporal dbname=temporal sslmode=disable"

	// Инициализируем базу данных
	if err := database.InitDB(connStr); err != nil {
		log.Fatalf("Не удалось подключиться к базе данных: %v", err)
	}
	fmt.Println("Успешное подключение к Postgres!")

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/workflows", createWorkflowHandler)
	mux.HandleFunc("GET /api/workflows/{id}", getWorkflowHandler)

	fmt.Println("Сервер запущен на http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
