package models

type Workflow struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Steps       []StepInput `json:"steps"` // Это входные данные
}

// Структура для входящего JSON
type StepInput struct {
	Name   string                 `json:"name"`
	Action string                 `json:"action"`
	Params map[string]interface{} `json:"params"`
}

// Структура для YAML (для Zigflow)
type ZigflowConfig struct {
	Document Document                 `yaml:"document"`
	Do       []map[string]interface{} `yaml:"do"` // Список мап, где ключи - это имена шагов
}
type Document struct {
	DSL          string `yaml:"dsl"`
	TaskQueue    string `yaml:"taskQueue"`
	WorkflowType string `yaml:"workflowType"`
	Version      string `yaml:"version"`
	Title        string `yaml:"title"`
	Summary      string `yaml:"summary"`
}

// Step — это map, который принимает {"имя": {"действие": {...}}}
type Step map[string]interface{}
