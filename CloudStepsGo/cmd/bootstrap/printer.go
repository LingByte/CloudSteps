package bootstrap

import (
	"fmt"
	"os"
	"strings"
)

// PrintBannerFromFile Read file and print, auto-generate if file doesn't exist
func PrintBannerFromFile(filename string, defaultText string) error {
	// Ensure banner file exists, generate if it doesn't
	if err := EnsureBannerFile(filename, defaultText); err != nil {
		return fmt.Errorf("failed to ensure banner file: %w", err)
	}

	data, err := os.ReadFile(filename)
	if err != nil {
		return err
	}

	lines := strings.Split(string(data), "\n")

	colors := []string{
		"\x1b[38;5;17m",
		"\x1b[38;5;18m",
		"\x1b[38;5;19m",
		"\x1b[38;5;20m",
		"\x1b[38;5;21m",
		"\x1b[38;5;26m",
	}

	for i, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		color := colors[i%len(colors)]
		fmt.Println(color + line + "\x1b[0m")
	}
	return nil
}
