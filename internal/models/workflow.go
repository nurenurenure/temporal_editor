package models

type Workflow struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Steps       []StepInput `json:"steps"`
}

type StepInput struct {
	Name string                 `json:"name"`
	Body map[string]interface{} `json:"body"`
}

type ZigflowConfig struct {
	Document Document                 `yaml:"document"`
	Do       []map[string]interface{} `yaml:"do"`
}

type Document struct {
	DSL          string `yaml:"dsl"`
	TaskQueue    string `yaml:"taskQueue"`
	WorkflowType string `yaml:"workflowType"`
	Version      string `yaml:"version"`
	Title        string `yaml:"title"`
	Summary      string `yaml:"summary"`
}

// Структура для тела POST-запроса
type WorkflowPayload struct {
	Data []map[string]interface{} `json:"data"`
}
