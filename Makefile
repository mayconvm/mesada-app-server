# Mesada App Server — deploy local (compose) + k8s (helm)
# Uso: make help | make keys | make lint | make template | make upgrade-prod

CHART        := k8s
RELEASE      ?= mesada-supabase
NAMESPACE    ?= mesada
VALUES       := k8s/values.yaml
VALUES_PROD  := k8s/values-prod.yaml
ENV_FILE     ?= infra/.env
COMPOSE_FILE := infra/docker-compose.yml

# Carrega infra/.env se existir (POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY)
ifneq (,$(wildcard $(ENV_FILE)))
include $(ENV_FILE)
export
endif

HELM_SET := \
	--set postgres.password="$(POSTGRES_PASSWORD)" \
	--set auth.jwtSecret="$(JWT_SECRET)" \
	--set auth.anonKey="$(ANON_KEY)" \
	--set auth.serviceRoleKey="$(SERVICE_ROLE_KEY)"

.PHONY: help keys lint template template-prod install upgrade upgrade-prod uninstall status restart functions-code local-up local-down local-logs ns

help: ## Lista os targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

keys: ## Gera infra/.env via infra/gen-keys.mjs (não sobrescreve se existir)
	@if [ -f "$(ENV_FILE)" ]; then echo "$(ENV_FILE) já existe, nada feito."; \
	else node infra/gen-keys.mjs > "$(ENV_FILE)" && echo "Gerado $(ENV_FILE)."; fi

ns: ## Cria o namespace (idempotente)
	kubectl create ns $(NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -

lint: ## helm lint (default + prod)
	helm lint ./$(CHART)
	helm lint ./$(CHART) -f $(VALUES_PROD)

template: ## Renderiza manifests com values.yaml
	helm template $(RELEASE) ./$(CHART) -f $(VALUES) $(HELM_SET)

template-prod: ## Renderiza manifests com values-prod.yaml
	helm template $(RELEASE) ./$(CHART) -f $(VALUES_PROD) $(HELM_SET)

install: ns functions-code ## Instala o release (falha se já existir; use upgrade)
	helm install $(RELEASE) ./$(CHART) -n $(NAMESPACE) -f $(VALUES) $(HELM_SET)

upgrade: ns functions-code ## Instala ou atualiza com values.yaml
	helm upgrade --install $(RELEASE) ./$(CHART) -n $(NAMESPACE) -f $(VALUES) $(HELM_SET)

upgrade-prod: ns functions-code ## Instala ou atualiza com values-prod.yaml
	helm upgrade --install $(RELEASE) ./$(CHART) -n $(NAMESPACE) -f $(VALUES_PROD) $(HELM_SET)

functions-code: ## Regenera o ConfigMap do codigo em supabase/functions/
	python3 scripts/gen-functions-code.py

restart: ## Reinicia os Deployments (puxa codigo novo das functions)
	kubectl rollout restart deploy -n $(NAMESPACE) -l app.kubernetes.io/part-of=mesada-supabase

uninstall: ## Remove o release (mantém PVCs por padrão)
	helm uninstall $(RELEASE) -n $(NAMESPACE)

status: ## Mostra status do release e pods
	helm status $(RELEASE) -n $(NAMESPACE)
	kubectl get pods -n $(NAMESPACE)

local-up: keys ## Sobe stack local via docker compose
	docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d

local-down: ## Derruba stack local
	docker compose -f $(COMPOSE_FILE) down

local-logs: ## Logs da stack local
	docker compose -f $(COMPOSE_FILE) logs -f
