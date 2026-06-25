package validator

import (
	"fmt"
	"temporal_editor/internal/models"
)

func ValidateSteps(steps []models.StepInput) error {

	if len(steps) == 0 {
		return fmt.Errorf("workflow должен содержать хотя бы один шаг")
	}

	for _, step := range steps {

		if step.Name == "" {
			return fmt.Errorf("имя шага не может быть пустым")
		}

		if len(step.Body) == 0 {
			return fmt.Errorf("шаг %s пустой", step.Name)
		}
	}

	return nil
}
