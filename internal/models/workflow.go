package models

/*
+set
switch
if
for-loop
+wait
call: activity
output
*fork
*try
*signal
*call: grpc
*/
// Workflow описывает весь процесс
type Workflow struct {
	ID          string `json:"id" db:"id" yaml:"-"`
	Name        string `json:"name" yaml:"name"`
	Description string `json:"description" yaml:"description"`
	Steps       []Step `json:"steps" yaml:"steps"`
}

// Step объединяет возможные операции.
type Step struct {
	Set    *SetOperation          `json:"set,omitempty" yaml:"set,omitempty"`
	Wait   *WaitOperation         `json:"wait,omitempty" yaml:"wait,omitempty"`
	Output map[string]interface{} `json:"output,omitempty" yaml:"output,omitempty"`
}

// SetOperation для объявления переменных
type SetOperation struct {
	Variables map[string]interface{} `json:"variables" yaml:"variables"`
}

// WaitOperation для задержки
type WaitOperation struct {
	Duration string `json:"duration" yaml:"duration"`
}
