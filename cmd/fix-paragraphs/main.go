// Package main: 批量修复已导入 RACE 文章的段落分隔
//
// 将 content 中的单换行符 \n 转为双换行符 \n\n，使前端能正确分段。
// 已有 \n\n 的文章跳过。
//
// 用法:
//
//	go run ./cmd/fix-paragraphs
package main

import (
	"fmt"
	"os"
	"strings"

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

	// RACE 阅读理解
	var racePassages []models.ReadingPassage
	db.Where("title LIKE ?", "RACE-%").Find(&racePassages)
	raceFixed := 0
	for _, p := range racePassages {
		if strings.Contains(p.Content, "\n\n") {
			continue // 已有段落分隔
		}
		if !strings.Contains(p.Content, "\n") {
			continue // 无换行符，不需要修复
		}
		newContent := strings.ReplaceAll(p.Content, "\n", "\n\n")
		if err := db.Model(&models.ReadingPassage{}).Where("id = ?", p.ID).Update("content", newContent).Error; err == nil {
			raceFixed++
		}
	}
	fmt.Printf("RACE 修复段落: %d 篇\n", raceFixed)

	// CEPOC 完形填空
	var cepocPassages []models.ClozePassage
	db.Where("title LIKE ?", "CEPOC-%").Find(&cepocPassages)
	cepocFixed := 0
	for _, p := range cepocPassages {
		if strings.Contains(p.Content, "\n\n") {
			continue
		}
		if !strings.Contains(p.Content, "\n") {
			continue
		}
		newContent := strings.ReplaceAll(p.Content, "\n", "\n\n")
		if err := db.Model(&models.ClozePassage{}).Where("id = ?", p.ID).Update("content", newContent).Error; err == nil {
			cepocFixed++
		}
	}
	fmt.Printf("CEPOC 修复段落: %d 篇\n", cepocFixed)
}
