APP_LABEL="the notifications stack"
APP_ENV_FILE="docker/.env.app.local"
APP_ENV_EXAMPLE_FILE="docker/.env.app.local.example"
COMPOSE_FILES=(docker/compose.app.local.yml)
DEV_COMPOSE_FILES=(docker/compose.app.dev.yml)

OPENBAO_SECRET_PATH="notifications"
OPENBAO_REQUIRED_KEYS="SMTP_PASS,POSTGRES_PASSWORD"
OPENBAO_EXPORT_KEYS="POSTGRES_PASSWORD"

DB_SERVICE="notifications_db"
DB_USER="notifications_admin"
DB_NAME="notifications"
DB_BOOTSTRAP_DB="notifications"

RESET_MODE="volumes"
READY_MESSAGE="notifications stack started."
READY_URLS=("http://localhost:18080/health")
