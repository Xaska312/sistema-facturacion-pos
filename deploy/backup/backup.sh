#!/bin/sh
# Respaldo completo de la base: plataforma (usuarios, negocios) y todos los schemas de negocios t_*.
# Uso manual: docker compose -f docker-compose.prod.yml exec backup backup.sh
set -eu
LOG_TAG=respaldo
. /usr/local/bin/common.sh

stamp=$(date +%Y-%m-%dT%H%M%S)
file="$BACKUP_DIR/${PGDATABASE}_${stamp}.dump"
partial="$file.part"

on_exit() {
    code=$?
    if [ "$code" -ne 0 ]; then
        rm -f "$partial"
        log "FALLÓ (código $code). Revisa los mensajes anteriores."
        ping_monitor "${BACKUP_PING_URL:-}" /fail
    fi
}
trap on_exit EXIT

ping_monitor "${BACKUP_PING_URL:-}" /start
mkdir -p "$BACKUP_DIR"

log "Generando $(basename "$file")…"
# Formato custom: comprimido y restaurable por partes (un solo negocio si hiciera falta).
pg_dump --format=custom --compress=6 --file="$partial"
# El archivo se puede leer de punta a punta (detecta un respaldo truncado o dañado).
pg_restore --list "$partial" > /dev/null
mv "$partial" "$file"
log "Listo: $(du -h "$file" | cut -f1)."

# Copias locales: las más recientes (sirven para restaurar rápido sin descargar).
ls -1t "$BACKUP_DIR"/*.dump | tail -n "+$((BACKUP_KEEP_LOCAL + 1))" | while read -r old; do
    rm -f "$old"
    log "Copia local antigua borrada: $(basename "$old")"
done

if [ -n "$BACKUP_REMOTE" ]; then
    log "Subiendo a $BACKUP_REMOTE (cifrado)…"
    rclone copy "$file" "${BACKUP_REMOTE}daily/" --retries 5 --low-level-retries 10
    # Una copia mensual: la primera que se logre subir en el mes.
    month=$(date +%Y-%m)
    if [ -z "$(rclone lsf "${BACKUP_REMOTE}monthly/" --include "*_${month}-*" 2>/dev/null)" ]; then
        rclone copy "$file" "${BACKUP_REMOTE}monthly/" --retries 5
        log "Copia mensual de $month guardada."
    fi
    # Retención en la nube.
    rclone delete "${BACKUP_REMOTE}daily/" --min-age "${BACKUP_KEEP_DAILY_DAYS}d"
    rclone delete "${BACKUP_REMOTE}monthly/" --min-age "${BACKUP_KEEP_MONTHLY_DAYS}d"
    log "Subido a la nube. Se conservan ${BACKUP_KEEP_DAILY_DAYS} días de diarios y ${BACKUP_KEEP_MONTHLY_DAYS} días de mensuales."
else
    log "AVISO: sin BACKUP_REMOTE, el respaldo queda solo en este servidor."
fi

date '+%Y-%m-%dT%H:%M:%S%z' > "$BACKUP_DIR/last-success"
ping_monitor "${BACKUP_PING_URL:-}" ""
log "Respaldo terminado."
