# CloudSteps Makefile
# 用法: make help 查看所有命令

SHELL := /bin/bash

# ============================================================
# 变量
# ============================================================
MODULE   := github.com/LingByte/CloudStepsGo
APP_NAME := cloudsteps
VERSION  := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT   := $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
BUILD_DT := $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')

DIST_DIR := dist

# Go 编译参数
LDFLAGS  := -s -w \
  -X main.Version=$(VERSION) \
  -X main.GitCommit=$(COMMIT) \
  -X main.BuildTime=$(BUILD_DT)

GCFLAGS  :=

# 目标平台: GOOS/GOARCH
PLATFORMS := \
  linux/amd64

# 前端目录
WEB_DIR   := web
ADMIN_DIR := admin

# 颜色
COLOR_RESET := \033[0m
COLOR_GREEN := \033[32m
COLOR_CYAN  := \033[36m
COLOR_YELL  := \033[33m

# ============================================================
# 默认目标
# ============================================================
.PHONY: help
help: ## 显示所有可用命令
	@echo ""
	@echo "CloudSteps 构建系统 (v$(VERSION))"
	@echo ""
	@echo "用法: make <target>"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(COLOR_CYAN)%-22s$(COLOR_RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "平台列表: $(PLATFORMS)"
	@echo ""

# ============================================================
# 前端构建
# ============================================================
.PHONY: web admin frontend frontend-clean

web: ## 构建前端 (web)
	@echo "$(COLOR_CYAN)==> 构建 web 前端$(COLOR_RESET)"
	cd $(WEB_DIR) && npm run build
	@echo "$(COLOR_GREEN)==> web 构建完成: $(WEB_DIR)/dist/$(COLOR_RESET)"

admin: ## 构建管理后台 (admin)
	@echo "$(COLOR_CYAN)==> 构建 admin 前端$(COLOR_RESET)"
	cd $(ADMIN_DIR) && pnpm run build
	@echo "$(COLOR_GREEN)==> admin 构建完成: $(ADMIN_DIR)/dist/$(COLOR_RESET)"

frontend: web admin ## 构建所有前端 (web + admin)

frontend-clean: ## 清理前端构建产物
	rm -rf $(WEB_DIR)/dist $(ADMIN_DIR)/dist

# ============================================================
# 后端构建 — 当前平台
# ============================================================
.PHONY: backend backend-server backend-clean

backend: backend-server ## 构建后端 (当前平台)

backend-server: ## 构建后端 server (当前平台)
	@echo "$(COLOR_CYAN)==> 构建 $(APP_NAME) server [$(shell go env GOOS)/$(shell go env GOARCH)]$(COLOR_RESET)"
	@mkdir -p $(DIST_DIR)
	GOFLAGS=-mod=mod CGO_ENABLED=0 go build \
		-ldflags "$(LDFLAGS)" \
		-gcflags "$(GCFLAGS)" \
		-o $(DIST_DIR)/$(APP_NAME)-server-$(shell go env GOOS)-$(shell go env GOARCH)$(shell [ $(shell go env GOOS) = windows ] && echo .exe) \
		./cmd/server
	@echo "$(COLOR_GREEN)==> 后端构建完成: $(DIST_DIR)/$(COLOR_RESET)"

backend-clean: ## 清理后端构建产物
	rm -rf $(DIST_DIR)/$(APP_NAME)-server-*

# ============================================================
# 后端构建 — 全平台交叉编译
# ============================================================
.PHONY: backend-all backend-all-zip

backend-all: $(addprefix build-,$(PLATFORMS)) ## 交叉编译所有平台后端

# 通用交叉编译模板
define build_platform
.PHONY: build-$(1)/$(2)
build-$(1)/$(2):
	@echo "$(COLOR_CYAN)==> 构建 $(APP_NAME) [$(1)/$(2)]$(COLOR_RESET)"
	@mkdir -p $(DIST_DIR)
	GOFLAGS=-mod=mod CGO_ENABLED=0 GOOS=$(1) GOARCH=$(2) go build \
		-ldflags "$(LDFLAGS)" \
		-gcflags "$(GCFLAGS)" \
		-o $(DIST_DIR)/$(APP_NAME)-server-$(1)-$(2)$(shell [ $(1) = windows ] && echo .exe) \
		./cmd/server
	@echo "$(COLOR_GREEN)==> 完成: $(DIST_DIR)/$(APP_NAME)-server-$(1)-$(2)$(shell [ $(1) = windows ] && echo .exe)$(COLOR_RESET)"
endef

$(foreach p,$(PLATFORMS),$(eval $(call build_platform,$(word 1,$(subst /, ,$(p))),$(word 2,$(subst /, ,$(p))))))

backend-all-zip: backend-all ## 交叉编译所有平台并打包 zip/tar.gz
	@echo "$(COLOR_CYAN)==> 打包所有平台$(COLOR_RESET)"
	@cd $(DIST_DIR) && for f in $(APP_NAME)-server-*; do \
		if [[ "$$f" == *.exe ]]; then \
			zip -q "$${f%.exe}.zip" "$$f" && rm "$$f"; \
			echo "  -> $$f.zip"; \
		else \
			tar czf "$$f.tar.gz" "$$f" && rm "$$f"; \
			echo "  -> $$f.tar.gz"; \
		fi; \
	done
	@echo "$(COLOR_GREEN)==> 打包完成: $(DIST_DIR)/$(COLOR_RESET)"

# ============================================================
# 工具命令构建
# ============================================================
.PHONY: tools tools-clean

TOOLS := analyze-word-dups clean-duplicate-words ddjdc-dict-import ddjdc-import dedupe-word-audio fill-missing-word-audio iciba-scrape migrate-seed purge-ddjdc-audio purge-orphan-tts purge-vocab-audio qcloud-get-appid seed-notify-channels tts-gen

tools: $(addprefix tool-,$(TOOLS)) ## 构建所有 cmd 工具 (当前平台)

define build_tool
.PHONY: tool-$(1)
tool-$(1):
	@echo "$(COLOR_CYAN)==> 构建 tool: $(1)$(COLOR_RESET)"
	@mkdir -p $(DIST_DIR)/tools
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o $(DIST_DIR)/tools/$(1) ./scripts/$(1)
	@echo "$(COLOR_GREEN)  -> $(DIST_DIR)/tools/$(1)$(COLOR_RESET)"
endef

$(foreach t,$(TOOLS),$(eval $(call build_tool,$(t))))

tools-clean:
	rm -rf $(DIST_DIR)/tools

# ============================================================
# 全量构建
# ============================================================
.PHONY: all all-zip dist dist-clean

all: frontend backend tools ## 构建一切 (前端 + 后端 + 工具, 当前平台)

all-zip: frontend backend-all-zip tools ## 构建一切 (前端 + 全平台后端打包 + 工具)

dist: all ## 同 all

dist-clean: frontend-clean backend-clean tools-clean ## 清理所有构建产物
	rm -rf $(DIST_DIR)

# ============================================================
# 开发
# ============================================================
.PHONY: dev dev-web dev-admin dev-server

dev: dev-web ## 启动前端开发服务器
dev-web: ## 启动 web 开发服务器
	cd $(WEB_DIR) && npm run dev

dev-admin: ## 启动 admin 开发服务器
	cd $(ADMIN_DIR) && pnpm run dev

dev-server: ## 启动后端开发服务器
	go run ./cmd/server

# ============================================================
# 测试
# ============================================================
.PHONY: test test-go test-web test-admin

test: test-go test-web test-admin ## 运行所有测试

test-go: ## 运行 Go 测试
	go test ./... -v -count=1

test-web: ## 运行 web 前端测试
	cd $(WEB_DIR) && npm run test -- --passWithNoTests 2>/dev/null || echo "web: 无测试脚本"

test-admin: ## 运行 admin 前端测试
	cd $(ADMIN_DIR) && pnpm run test -- --passWithNoTests 2>/dev/null || echo "admin: 无测试脚本"

# ============================================================
# 依赖安装
# ============================================================
.PHONY: deps deps-go deps-web deps-admin

deps: deps-go deps-web deps-admin ## 安装所有依赖

deps-go: ## 安装 Go 依赖
	go mod download

deps-web: ## 安装 web 前端依赖
	cd $(WEB_DIR) && npm install

deps-admin: ## 安装 admin 前端依赖
	cd $(ADMIN_DIR) && pnpm install

# ============================================================
# Docker (可选)
# ============================================================
.PHONY: docker docker-clean

docker: ## 构建 Docker 镜像
	docker build -t $(APP_NAME):$(VERSION) .

docker-clean: ## 清理 Docker 镜像
	docker rmi $(APP_NAME):$(VERSION) 2>/dev/null || true

# ============================================================
# 信息
# ============================================================
.PHONY: info
info: ## 显示构建信息
	@echo "APP_NAME : $(APP_NAME)"
	@echo "VERSION  : $(VERSION)"
	@echo "COMMIT   : $(COMMIT)"
	@echo "BUILD_DT : $(BUILD_DT)"
	@echo "MODULE   : $(MODULE)"
	@echo "DIST_DIR : $(DIST_DIR)"
	@echo "PLATFORMS: $(PLATFORMS)"
