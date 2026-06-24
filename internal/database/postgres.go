package database

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"temporal_editor/internal/models"

	_ "github.com/lib/pq"
)

var DB *sql.DB

// подключение к ДБ и создание таблицы
func InitDB(connStr string) error {
	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		return err
	}

	if err = DB.Ping(); err != nil {
		return err
	}

	// Создаем таблицу
	createTableQuery := `
	CREATE TABLE IF NOT EXISTS workflows (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		name VARCHAR(255) NOT NULL,
		description TEXT,
		config_json JSONB NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);`

	_, err = DB.Exec(createTableQuery)
	return err
}

// SaveWorkflow сохраняет JSON в базу и возвращает сгенерированный ID
func SaveWorkflow(wf *models.Workflow) error {
	// Превращаем массив шагов в JSON-строку для базы
	stepsJSON, err := json.Marshal(wf.Steps)
	if err != nil {
		return fmt.Errorf("ошибка маршалинга шагов: %w", err)
	}

	query := `
		INSERT INTO workflows (name, description, config_json)
		VALUES ($1, $2, $3)
		RETURNING id;
	`
	// Выполняем запрос и сразу записываем новый UUID в структуру wf
	err = DB.QueryRow(query, wf.Name, wf.Description, stepsJSON).Scan(&wf.ID)
	if err != nil {
		return fmt.Errorf("ошибка сохранения в БД: %w", err)
	}

	return nil
}

// GetWorkflowByID получает воркфлоу из БД по его ID
func GetWorkflowByID(id string) (*models.Workflow, error) {
	var wf models.Workflow
	var stepsJSON []byte //JSONB из базы

	query := `
		SELECT id, name, description, config_json 
		FROM workflows 
		WHERE id = $1;
	`

	// Выполняем запрос и записываем результаты в переменные
	err := DB.QueryRow(query, id).Scan(&wf.ID, &wf.Name, &wf.Description, &stepsJSON)
	if err != nil {
		return nil, fmt.Errorf("ошибка поиска в БД: %w", err)
	}

	// Превращаем строку JSON обратно в массив шагов Go
	if err := json.Unmarshal(stepsJSON, &wf.Steps); err != nil {
		return nil, fmt.Errorf("ошибка парсинга шагов: %w", err)
	}

	return &wf, nil
}
