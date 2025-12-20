# Angular Admin Dashboard - Makefile with Docker Container Commands
.PHONY: help install build serve test lint docker-build docker-up docker-down docker-logs docker-exec docker-install clean

# Variables
PROJECT_NAME = angular-military-admin
DOCKER_IMAGE = $(PROJECT_NAME):latest
DOCKER_CONTAINER = angular-admin-dashboard
DEV_PORT = 4200
PROD_PORT = 8080
CONTAINER_WORKDIR = /app

# Default target
help:
	@echo "========================================================"
	@echo "  ANGULAR ADMIN DASHBOARD - DOCKER COMMANDS  "
	@echo "========================================================"


# ===========================================
# 🐳 DOCKER CONTAINER COMMANDS
# ===========================================

# Open interactive shell in running container
docker-shell:
	@echo "🔧 Opening shell in $(DOCKER_CONTAINER)..."
	@if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec -it $(DOCKER_CONTAINER) /bin/sh; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
		echo "   Run 'make docker-up' first."; \
	fi

# Install npm packages inside Docker container
docker-install:
	@echo "📦 Installing npm packages in $(DOCKER_CONTAINER)..."
	@if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec $(DOCKER_CONTAINER) npm install; \
		echo "✅ Packages installed successfully!"; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
		echo "   Run 'make docker-up' first."; \
	fi

# Uninstall npm packages from Docker container
docker-uninstall:
	@if [ -z "$(pkg)" ]; then \
		echo "❌ Usage: make docker-uninstall pkg=<package-name>"; \
		exit 1; \
	fi
	@echo "🗑️ Uninstalling $(pkg) from $(DOCKER_CONTAINER)..."
	@if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec $(DOCKER_CONTAINER) npm uninstall $(pkg); \
		echo "✅ Package $(pkg) uninstalled!"; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
	fi

# Update npm packages inside Docker container
docker-update:
	@echo "🔄 Updating npm packages in $(DOCKER_CONTAINER)..."
	@if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec $(DOCKER_CONTAINER) npm update; \
		echo "✅ Packages updated!"; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
	fi

# Run npm audit in Docker container
docker-audit:
	@echo "🔍 Running npm audit in $(DOCKER_CONTAINER)..."
	@if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec $(DOCKER_CONTAINER) npm audit; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
	fi

# Build Angular app inside Docker container
docker-build-app:
	@echo "🏗️ Building Angular app in $(DOCKER_CONTAINER)..."
	@if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec $(DOCKER_CONTAINER) npm run build; \
		echo "✅ Build completed!"; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
	fi

# Run tests inside Docker container
docker-test:
	@echo "🧪 Running tests in $(DOCKER_CONTAINER)..."
	@if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec $(DOCKER_CONTAINER) npm test; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
	fi

# Run linter inside Docker container
docker-lint:
	@echo "📝 Running linter in $(DOCKER_CONTAINER)..."
	@if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec $(DOCKER_CONTAINER) npm run lint; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
	fi


# Angular Component Generator
.PHONY: gen-comp

# Angular Component Generator
.PHONY: gen-comp

gen-comp:
	@if [ -z "$(filter-out $@,$(MAKECMDGOALS))" ]; then \
		echo "❌ Usage: make gen-comp <component-path>"; \
		exit 1; \
	fi
	@COMP_PATH="$(filter-out $@,$(MAKECMDGOALS))"; \
	BASENAME=$$(basename "$$COMP_PATH"); \
	CLASS_NAME=$$(echo "$$BASENAME" | sed 's/[^a-zA-Z0-9]/ /g' | sed 's/\b\(.\)/\u\1/g' | sed 's/ //g'); \
	\
	mkdir -p "$$COMP_PATH"; \
	\
	touch "$$COMP_PATH/$$BASENAME.component.html"; \
	touch "$$COMP_PATH/$$BASENAME.component.scss"; \
	\
	echo "import { Component } from '@angular/core';" > "$$COMP_PATH/$$BASENAME.component.ts"; \
	echo "" >> "$$COMP_PATH/$$BASENAME.component.ts"; \
	echo "@Component({" >> "$$COMP_PATH/$$BASENAME.component.ts"; \
	echo "  selector: 'app-$$BASENAME'," >> "$$COMP_PATH/$$BASENAME.component.ts"; \
	echo "  templateUrl: './$$BASENAME.component.html'," >> "$$COMP_PATH/$$BASENAME.component.ts"; \
	echo "  styleUrls: ['./$$BASENAME.component.scss']" >> "$$COMP_PATH/$$BASENAME.component.ts"; \
	echo "})" >> "$$COMP_PATH/$$BASENAME.component.ts"; \
	echo "export class $$CLASS_NAMEComponent {" >> "$$COMP_PATH/$$BASENAME.component.ts"; \
	echo "  constructor() {}" >> "$$COMP_PATH/$$BASENAME.component.ts"; \
	echo "}" >> "$$COMP_PATH/$$BASENAME.component.ts"; \
	\
	echo "✅ Created: $$COMP_PATH/$$BASENAME.component.ts"; \
	echo "✅ Created: $$COMP_PATH/$$BASENAME.component.html"; \
	echo "✅ Created: $$COMP_PATH/$$BASENAME.component.scss";

# Install npm package in container using command-line arguments
# Usage: make add-pkg tailwindcss
add-pkg:
	@if [ -z "$(filter-out $@,$(MAKECMDGOALS))" ]; then \
		echo "❌ Error: Package name is required"; \
		echo "Usage: make add-pkg <package-name>"; \
		echo "Example: make add-pkg tailwindcss"; \
		exit 1; \
	fi
	@PKG_NAME="$(filter-out $@,$(MAKECMDGOALS))"; \
	echo "📦 Installing $$PKG_NAME in $(DOCKER_CONTAINER)..."; \
	if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec $(DOCKER_CONTAINER) npm install $$PKG_NAME --save; \
		echo "✅ Package $$PKG_NAME installed successfully!"; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
		echo "   Run 'make docker-up' first."; \
	fi
%:
	@: # This is a catch-all target that does nothing

# Install dev npm package in container using command-line arguments
# Usage: make add-pkg-dev jest
add-pkg-dev:
	@if [ -z "$(filter-out $@,$(MAKECMDGOALS))" ]; then \
		echo "❌ Error: Package name is required"; \
		echo "Usage: make add-pkg-dev <package-name>"; \
		echo "Example: make add-pkg-dev jest"; \
		exit 1; \
	fi
	@PKG_NAME="$(filter-out $@,$(MAKECMDGOALS))"; \
	echo "📦 Installing $$PKG_NAME as dev dependency in $(DOCKER_CONTAINER)..."; \
	if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec $(DOCKER_CONTAINER) npm install $$PKG_NAME --save-dev; \
		echo "✅ Package $$PKG_NAME installed as dev dependency!"; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
		echo "   Run 'make docker-up' first."; \
	fi
%:
	@: # This is a catch-all target that does nothing


# List installed packages in Docker container
docker-list-pkgs:
	@echo "📋 Listing installed packages in $(DOCKER_CONTAINER)..."
	@if docker ps | grep -q $(DOCKER_CONTAINER); then \
		echo "=== Production Dependencies ==="; \
		docker exec $(DOCKER_CONTAINER) npm list --depth=0 --prod; \
		echo ""; \
		echo "=== Development Dependencies ==="; \
		docker exec $(DOCKER_CONTAINER) npm list --depth=0 --dev; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
	fi

# Check for outdated packages in Docker container
docker-outdated:
	@echo "📅 Checking for outdated packages in $(DOCKER_CONTAINER)..."
	@if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec $(DOCKER_CONTAINER) npm outdated; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
	fi

# Run npm doctor in Docker container
docker-doctor:
	@echo "🏥 Running npm doctor in $(DOCKER_CONTAINER)..."
	@if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec $(DOCKER_CONTAINER) npm doctor; \
	else \
		echo "❌ Container $(DOCKER_CONTAINER) is not running!"; \
	fi

# ===========================================
# 🚀 DOCKER MANAGEMENT COMMANDS
# ===========================================

# Start development container
docker-up:
	@echo "🚀 Starting development container..."
	docker-compose up angular-dev -d
	@echo "✅ Container started!"
	@echo "🌐 Application available at: http://localhost:$(DEV_PORT)"
	@echo "📝 View logs: make docker-logs-follow"

# Start production container
docker-up-prod:
	@echo "🚀 Starting production container..."
	docker-compose up angular-prod -d
	@echo "✅ Production container started!"
	@echo "🌐 Application available at: http://localhost:$(PROD_PORT)"

# Stop all containers
docker-down:
	@echo "🛑 Stopping all containers..."
	docker-compose down
	@echo "✅ Containers stopped!"

# Rebuild and restart container
docker-rebuild:
	@echo "🔨 Rebuilding and restarting container..."
	docker-compose down
	docker-compose build --no-cache angular-dev
	docker-compose up angular-dev -d
	@echo "✅ Container rebuilt and restarted!"

# View container logs
docker-logs:
	@echo "📄 Viewing container logs..."
	docker-compose logs angular-dev

# Follow container logs
docker-logs-follow:
	@echo "👀 Following container logs (Ctrl+C to stop)..."
	docker-compose logs -f angular-dev

# Show container resource usage
docker-stats:
	@echo "📊 Container resource usage:"
	@docker stats --no-stream $(DOCKER_CONTAINER) 2>/dev/null || echo "Container not running"

# List running containers
docker-ps:
	@echo "📋 Running containers:"
	@docker ps --filter "name=$(PROJECT_NAME)" --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"

# ===========================================
# 🛠️ DEVELOPMENT COMMANDS (LOCAL)
# ===========================================

# Start development server (local)
dev:
	@echo "🚀 Starting local development server..."
	npm run start

# Build for production (local)
build:
	@echo "🏗️ Building for production..."
	npm run build

# Install dependencies (local)
install:
	@echo "📦 Installing local dependencies..."
	npm install

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist/ node_modules/ .angular/ coverage/ .cache/
	@echo "✅ Clean completed!"

# ===========================================
# 📊 UTILITY COMMANDS
# ===========================================

# Health check
health-check:
	@echo "🏥 Performing system health check..."
	@echo ""
	@echo "=== Docker Status ==="
	@if command -v docker >/dev/null 2>&1; then \
		echo "✓ Docker is installed"; \
		docker --version | head -1; \
	else \
		echo "✗ Docker is not installed"; \
	fi
	@echo ""
	@echo "=== Container Status ==="
	@docker ps --filter "name=$(PROJECT_NAME)" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "No containers running"
	@echo ""
	@echo "=== Node.js Status ==="
	@if command -v node >/dev/null 2>&1; then \
		echo "✓ Node.js is installed"; \
		node --version; \
	else \
		echo "✗ Node.js is not installed"; \
	fi
	@echo ""
	@echo "=== npm Status ==="
	@if command -v npm >/dev/null 2>&1; then \
		echo "✓ npm is installed"; \
		npm --version; \
	else \
		echo "✗ npm is not installed"; \
	fi

# Show project status
status:
	@echo "📊 Project Status:"
	@echo "=================="
	@if [ -f "package.json" ]; then \
		echo "✓ package.json exists"; \
		echo "  Project: $$(jq -r '.name' package.json 2>/dev/null || echo 'Unknown')"; \
		echo "  Version: $$(jq -r '.version' package.json 2>/dev/null || echo 'Unknown')"; \
	else \
		echo "✗ package.json not found"; \
	fi
	@echo ""
	@echo "=== Docker Containers ==="
	@docker ps --filter "name=$(PROJECT_NAME)" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "No containers running"
	@echo ""
	@echo "=== Quick Commands ==="
	@echo "  View logs: make docker-logs-follow"
	@echo "  Open shell: make docker-shell"
	@echo "  Stop containers: make docker-down"

# Backup node_modules
backup-deps:
	@echo "💾 Backing up dependencies..."
	@if [ -d "node_modules" ]; then \
		BACKUP_FILE="node_modules_backup_$$(date +%Y%m%d_%H%M%S).tar.gz"; \
		tar -czf $$BACKUP_FILE node_modules/; \
		echo "✅ Backup created: $$BACKUP_FILE"; \
	else \
		echo "⚠️ node_modules directory not found!"; \
	fi

# Generate component
generate-component:
	@if [ -z "$(name)" ]; then \
		echo "❌ Usage: make generate-component name=<component-name>"; \
		exit 1; \
	fi
	@echo "🔧 Generating component: $(name)"
	@if docker ps | grep -q $(DOCKER_CONTAINER); then \
		docker exec $(DOCKER_CONTAINER) ng generate component components/$(name) --skip-tests; \
		echo "✅ Component generated in container!"; \
	else \
		ng generate component components/$(name) --skip-tests; \
		echo "✅ Component generated locally!"; \
	fi

# ===========================================
# 🎯 QUICK START COMMANDS
# ===========================================

# Quick start - sets up everything
quick-start:
	@echo "🚀 Quick Start - Angular Military Admin Dashboard"
	@echo "================================================"
	@echo ""
	@echo "Step 1: Starting development container..."
	@make docker-up
	@sleep 5
	@echo ""
	@echo "Step 2: Installing dependencies..."
	@make docker-install
	@sleep 3
	@echo ""
	@echo "Step 3: Opening browser..."
	@if command -v open >/dev/null 2>&1; then \
		open http://localhost:$(DEV_PORT); \
	elif command -v xdg-open >/dev/null 2>&1; then \
		xdg-open http://localhost:$(DEV_PORT); \
	fi
	@echo ""
	@echo "✅ Quick start complete!"
	@echo "🌐 Application: http://localhost:$(DEV_PORT)"
	@echo "📝 View logs: make docker-logs-follow"
	@echo "🔧 Open shell: make docker-shell"

# One-command deployment
deploy:
	@echo "🚀 Deploying Angular Military Admin Dashboard..."
	@make docker-down
	@make docker-build
	@make docker-up-prod
	@echo ""
	@echo "✅ Deployment complete!"
	@echo "🌐 Production app: http://localhost:$(PROD_PORT)"
