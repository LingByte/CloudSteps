package main

import (
	"fmt"
	"os"

	"github.com/LingByte/CloudStepsGo/internal/app"
	"github.com/LingByte/CloudStepsGo/internal/configs"
	"github.com/LingByte/CloudStepsGo/internal/models"
)

func main() {
	if _, err := configs.Load("configs/config.yaml"); err != nil {
		fmt.Fprintf(os.Stderr, "config: %v\n", err)
		os.Exit(1)
	}
	db, err := app.Connect(os.Stdout)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db: %v\n", err)
		os.Exit(1)
	}

	var total, tagged, untagged int64
	db.Model(&models.ReadingPassage{}).Where("title LIKE ?", "RACE-%").Count(&total)
	db.Model(&models.ReadingPassage{}).Where("title LIKE ? AND tags LIKE ?", "RACE-%", "%,%").Count(&tagged)
	db.Model(&models.ReadingPassage{}).Where("title LIKE ? AND (tags NOT LIKE ? OR tags = '' OR tags IS NULL)", "RACE-%", "%,%").Count(&untagged)
	fmt.Printf("RACE: 总计 %d, 已打标签 %d (%.1f%%), 未打 %d\n", total, tagged, float64(tagged)/float64(total)*100, untagged)
}
