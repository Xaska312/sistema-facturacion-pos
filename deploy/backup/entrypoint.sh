#!/bin/sh
# Programa el respaldo diario y la prueba semanal de restauración con el cron de busybox.
set -eu
. /usr/local/bin/common.sh

LOG_TAG=respaldos
: "${BACKUP_CRON:=30 3 * * *}"
: "${RESTORE_TEST_CRON:=0 5 * * 0}"

# Variables para las tareas de cron (solo lo que necesitan los scripts; el archivo queda legible solo por root).
umask 077
{
    for name in PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE APP_DB_USER TZ RCLONE_CONFIG \
        BACKUP_KEEP_LOCAL BACKUP_REMOTE BACKUP_KEEP_DAILY_DAYS BACKUP_KEEP_MONTHLY_DAYS \
        BACKUP_PING_URL RESTORE_TEST_PING_URL; do
        eval "value=\${$name-}"
        # Comillas simples con escape de las comillas internas.
        printf "export %s='%s'\n" "$name" "$(printf '%s' "$value" | sed "s/'/'\\\\''/g")"
    done
} > /etc/pos-backup.env
umask 022

mkdir -p "$BACKUP_DIR"
{
    echo "$BACKUP_CRON /usr/local/bin/backup.sh > /proc/1/fd/1 2>&1"
    if [ -n "$RESTORE_TEST_CRON" ]; then
        echo "$RESTORE_TEST_CRON /usr/local/bin/restore.sh --test > /proc/1/fd/1 2>&1"
    fi
} > /etc/crontabs/root

if [ -z "$BACKUP_REMOTE" ]; then
    log "AVISO: BACKUP_REMOTE está vacío. Los respaldos quedan solo en este servidor."
elif [ ! -f "$RCLONE_CONFIG" ]; then
    log "AVISO: no existe $RCLONE_CONFIG. Sin él no se puede subir a Google Drive (ver docs/DESPLIEGUE.md)."
fi
log "Respaldo programado: '$BACKUP_CRON' · prueba de restauración: '${RESTORE_TEST_CRON:-desactivada}' · zona ${TZ:-UTC}"

# -d: registro en la salida estándar (docker logs); 8 = solo lo importante.
exec crond -f -d 8
