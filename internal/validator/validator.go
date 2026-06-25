package validator

import (
	"fmt"
	"temporal_editor/internal/models"
)

// ValidateSteps проверяет обязательные параметры для поддерживаемых действий
func ValidateSteps(steps []models.StepInput) error {
	if len(steps) == 0 {
		return fmt.Errorf("воркфлоу должен содержать хотя бы один шаг")
	}

	for i, step := range steps {
		if step.Name == "" {
			return fmt.Errorf("шаг %d: имя шага не может быть пустым", i+1)
		}

		switch step.Action {
		case "set":
			if _, ok := step.Params["variables"]; !ok {
				return fmt.Errorf("шаг '%s': для действия 'set' обязателен параметр 'variables'", step.Name)
			}
		case "wait":
			if _, ok := step.Params["seconds"]; !ok {
				return fmt.Errorf("шаг '%s': для действия 'wait' обязателен параметр 'seconds'", step.Name)
			}
		case "if":
			if _, ok := step.Params["condition"]; !ok {
				return fmt.Errorf("шаг '%s': для действия 'if' обязателен параметр 'condition'", step.Name)
			}
		case "":
			return fmt.Errorf("шаг '%s': действие (action) не может быть пустым", step.Name)
		default:
		}
	}
	return nil
}
