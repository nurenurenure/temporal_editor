package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"temporal_editor/internal/models"

	"gopkg.in/yaml.v3"
)

func createWorkflowHandler(w http.ResponseWriter, r *http.Request) {
	var wf models.Workflow

	// 2. Читаем JSON
	err := json.NewDecoder(r.Body).Decode(&wf)
	if err != nil {
		http.Error(w, "Ошибка чтения JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// сериализация в YAML
	yamlData, err := yaml.Marshal(&wf)
	if err != nil {
		http.Error(w, "Ошибка генерации YAML", http.StatusInternalServerError)
		return
	}

	// результат в консоль сервера
	fmt.Printf("Получен запрос от фронтенда! Сгенерированный YAML:\n%s\n", string(yamlData))

	// ответ фронтенду
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "Воркфлоу успешно принят и сконвертирован",
	})
}

func main() {
	mux := http.NewServeMux()

	// POST на адрес /api/workflows
	mux.HandleFunc("POST /api/workflows", createWorkflowHandler)

	// Запускаем сервер на порту 8080
	fmt.Println("Сервер запущен на http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
