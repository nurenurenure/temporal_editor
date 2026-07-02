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
	var stepsJSON []byte

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

// GetAllWorkflows получает список всех воркфлоу из БД (сортировка от новых к старым)
func GetAllWorkflows() ([]models.Workflow, error) {
	var workflows []models.Workflow

	query := `
		SELECT id, name, description, config_json 
		FROM workflows 
		ORDER BY created_at DESC;
	`

	rows, err := DB.Query(query)
	if err != nil {
		return nil, fmt.Errorf("ошибка запроса списка воркфлоу: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var wf models.Workflow
		var stepsJSON []byte

		if err := rows.Scan(&wf.ID, &wf.Name, &wf.Description, &stepsJSON); err != nil {
			return nil, fmt.Errorf("ошибка чтения строки: %w", err)
		}

		if err := json.Unmarshal(stepsJSON, &wf.Steps); err != nil {
			return nil, fmt.Errorf("ошибка парсинга шагов для ID %s: %w", wf.ID, err)
		}

		workflows = append(workflows, wf)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	// Если таблица пустая, возвращаем пустой массив
	if workflows == nil {
		workflows = []models.Workflow{}
	}

	return workflows, nil
}

// UpdateWorkflow обновляет существующий воркфлоу
func UpdateWorkflow(id string, wf *models.Workflow) error {
	stepsJSON, err := json.Marshal(wf.Steps)
	if err != nil {
		return fmt.Errorf("ошибка маршалинга шагов: %w", err)
	}

	query := `
		UPDATE workflows 
		SET name = $1, description = $2, config_json = $3 
		WHERE id = $4;
	`

	result, err := DB.Exec(query, wf.Name, wf.Description, stepsJSON, id)
	if err != nil {
		return fmt.Errorf("ошибка обновления в БД: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return fmt.Errorf("воркфлоу с ID %s не найден", id)
	}

	return nil
}

// DeleteWorkflow удаляет воркфлоу по ID
func DeleteWorkflow(id string) error {
	query := `DELETE FROM workflows WHERE id = $1;`
	result, err := DB.Exec(query, id)
	if err != nil {
		return fmt.Errorf("ошибка удаления из БД: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return fmt.Errorf("воркфлоу с ID %s не найден", id)
	}
	return nil
}
