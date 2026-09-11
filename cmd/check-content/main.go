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

	// 查几篇 RACE 文章看内容格式
	var passages []models.ReadingPassage
	db.Where("title LIKE ?", "RACE-%").Limit(3).Find(&passages)
	for _, p := range passages {
		fmt.Printf("=== %s ===\n", p.Title)
		fmt.Printf("换行符数量: %d\n", strings.Count(p.Content, "\n"))
		fmt.Printf("前300字符 (repr):\n%q\n\n", p.Content[:min(300, len(p.Content))])
		fmt.Println("---")
	}

	// 对比原始 RACE 数据
	fmt.Println("\n=== 原始 RACE 数据 ===")
	origData, err := os.ReadFile("/tmp/cloudsteps-data/RACE/train/middle/1001.txt")
	if err != nil {
		fmt.Printf("读取原始文件失败: %v\n", err)
	} else {
		fmt.Printf("换行符数量: %d\n", strings.Count(string(origData), "\n"))
		fmt.Printf("前300字符 (repr):\n%q\n", string(origData[:min(300, len(origData))]))
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
