#!/bin/sh
# Funciones compartidas por backup.sh y restore.sh. Se carga con ".".

# Las tareas de cron no heredan las variables del contenedor: entrypoint.sh las deja en este archivo.
if [ -f /etc/pos-backup.env ]; then
    . /etc/pos-backup.env
fi

BACKUP_DIR=/backups
: "${PGDATABASE:?Falta PGDATABASE}"
: "${BACKUP_KEEP_LOCAL:=7}"
: "${BACKUP_KEEP_DAILY_DAYS:=30}"
: "${BACKUP_KEEP_MONTHLY_DAYS:=400}"
: "${BACKUP_REMOTE:=}"
# "posdrive-crypt:" o "posdrive-crypt:carpeta/": se le agrega "/" si hace falta para armar "<remoto>daily/".
case "$BACKUP_REMOTE" in
    "" | *: | */) ;;
    *) BACKUP_REMOTE="$BACKUP_REMOTE/" ;;
esac

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [$LOG_TAG] $*"
}

# Aviso opcional a un monitor de tareas (p. ej. healthchecks.io): $1 = URL base, $2 = "", "/start" o "/fail".
ping_monitor() {
    if [ -n "$1" ]; then
        curl -fsS -m 10 --retry 3 -o /dev/null "$1$2" || log "No se pudo avisar al monitor ($1$2)."
    fi
}

# Primer archivo .dump local más reciente (vacío si no hay).
latest_local_dump() {
    ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | head -n 1
}
