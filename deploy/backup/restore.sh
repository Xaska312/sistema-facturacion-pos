#!/bin/sh
# Restauración de respaldos. Se ejecuta dentro del contenedor "backup":
#   docker compose -f docker-compose.prod.yml exec backup restore.sh --list
#   docker compose -f docker-compose.prod.yml exec backup restore.sh --test [ARCHIVO]
#   docker compose -f docker-compose.prod.yml exec backup restore.sh --production ARCHIVO
#
# ARCHIVO: un .dump local (pos_hibrido_2026-10-06T033000.dump) o de la nube (daily/… o monthly/…).
# --test restaura en una base aparte, la revisa y la borra: nunca toca la base real (corre cada domingo).
# --production restaura en una base nueva y solo al final la cambia por la real; la anterior queda guardada
#   con otro nombre por si hay que volver atrás. Antes hay que detener el backend.
set -eu
LOG_TAG=restauracion
. /usr/local/bin/common.sh

usage() {
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
}

# Deja el archivo pedido en disco y escribe su ruta. Sin nombre: el respaldo local más reciente.
fetch_dump() {
    name="${1:-}"
    if [ -z "$name" ]; then
        name=$(latest_local_dump)
        [ -n "$name" ] || { log "No hay respaldos locales. Indica un archivo de la nube (daily/…)." >&2; exit 1; }
        echo "$name"
        return
    fi
    case "$name" in
        /*) [ -f "$name" ] && { echo "$name"; return; } ;;
    esac
    if [ -f "$BACKUP_DIR/$name" ]; then
        echo "$BACKUP_DIR/$name"
        return
    fi
    [ -n "$BACKUP_REMOTE" ] || { log "No existe $name en $BACKUP_DIR y no hay BACKUP_REMOTE." >&2; exit 1; }
    mkdir -p "$BACKUP_DIR/descargas"
    log "Descargando $name de $BACKUP_REMOTE…" >&2
    rclone copy "${BACKUP_REMOTE}${name}" "$BACKUP_DIR/descargas/" --retries 5 >&2
    local_file="$BACKUP_DIR/descargas/$(basename "$name")"
    [ -f "$local_file" ] || { log "No se encontró $name en la nube." >&2; exit 1; }
    echo "$local_file"
}

# Restaura $2 (archivo) en la base nueva $1, con el usuario de la app como dueño.
restore_into() {
    target="$1"
    file="$2"
    log "Restaurando $(basename "$file") en la base \"$target\"…"
    PGOPTIONS="-c client_min_messages=warning" dropdb --if-exists "$target"
    createdb --owner="$APP_DB_USER" "$target"
    pg_restore --exit-on-error --single-transaction --dbname="$target" "$file"
}

sql() {
    psql --no-psqlrc -q -v ON_ERROR_STOP=1 -At --dbname="$1" -c "$2"
}

# Revisa que la base restaurada esté completa. Falla si algún negocio no tiene su schema.
verify() {
    db="$1"
    tenants=$(sql "$db" "select count(*) from platform.tenants")
    users=$(sql "$db" "select count(*) from platform.users")
    missing=$(sql "$db" "select count(*) from platform.tenants t where t.status in ('ACTIVE','SUSPENDED')
        and not exists (select 1 from information_schema.schemata s where s.schema_name = t.schema_name)")
    sales=0
    products=0
    for schema in $(sql "$db" "select t.schema_name from platform.tenants t join information_schema.schemata s
            on s.schema_name = t.schema_name where t.status in ('ACTIVE','SUSPENDED') order by 1"); do
        sales=$((sales + $(sql "$db" "select count(*) from \"$schema\".sales")))
        products=$((products + $(sql "$db" "select count(*) from \"$schema\".products")))
    done
    log "Revisión: $tenants negocios, $users usuarios, $products productos, $sales ventas."
    if [ "$missing" -ne 0 ]; then
        log "ERROR: $missing negocio(s) activos sin su schema en el respaldo."
        return 1
    fi
}

no_app_connections() {
    count=$(sql postgres "select count(*) from pg_stat_activity where datname = '$PGDATABASE' and usename = '$APP_DB_USER'")
    [ "$count" -eq 0 ]
}

mode="${1:-}"
case "$mode" in
    --list)
        log "Respaldos locales ($BACKUP_DIR):"
        ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | xargs -r -n 1 basename || true
        if [ -n "$BACKUP_REMOTE" ]; then
            log "En la nube ($BACKUP_REMOTE):"
            rclone lsf "${BACKUP_REMOTE}daily/" 2>/dev/null | sed 's|^|daily/|' || true
            rclone lsf "${BACKUP_REMOTE}monthly/" 2>/dev/null | sed 's|^|monthly/|' || true
        fi
        ;;

    --test)
        test_db="${PGDATABASE}_prueba_restauracion"
        trap 'code=$?; dropdb --if-exists "$test_db" >/dev/null 2>&1 || true; [ "$code" -eq 0 ] || { log "PRUEBA FALLIDA (código $code)."; ping_monitor "${RESTORE_TEST_PING_URL:-}" /fail; }' EXIT
        ping_monitor "${RESTORE_TEST_PING_URL:-}" /start
        file=$(fetch_dump "${2:-}")
        restore_into "$test_db" "$file"
        verify "$test_db"
        # Lo descargado de la nube solo para la prueba no se guarda (las copias locales ya tienen su retención).
        case "$file" in "$BACKUP_DIR/descargas/"*) rm -f "$file" ;; esac
        log "Prueba de restauración correcta con $(basename "$file"). La base de prueba se borra."
        ping_monitor "${RESTORE_TEST_PING_URL:-}" ""
        ;;

    --production)
        [ -n "${2:-}" ] || usage
        if ! no_app_connections; then
            log "El backend sigue conectado a \"$PGDATABASE\". Detenlo primero:"
            log "  docker compose -f docker-compose.prod.yml stop backend"
            exit 1
        fi
        file=$(fetch_dump "$2")
        if [ "${3:-}" != "--yes" ]; then
            printf 'Se reemplazará la base "%s" por %s. Escribe RESTAURAR para continuar: ' "$PGDATABASE" "$(basename "$file")"
            read -r answer
            [ "$answer" = "RESTAURAR" ] || { log "Cancelado."; exit 1; }
        fi
        new_db="${PGDATABASE}_restaurando"
        old_db="${PGDATABASE}_antes_$(date +%Y%m%d%H%M%S)"
        restore_into "$new_db" "$file"
        verify "$new_db"
        sql postgres "alter database \"$PGDATABASE\" rename to \"$old_db\""
        sql postgres "alter database \"$new_db\" rename to \"$PGDATABASE\""
        log "Base restaurada. La anterior quedó como \"$old_db\" (bórrala con dropdb cuando confirmes que todo está bien)."
        log "Arranca el backend: docker compose -f docker-compose.prod.yml start backend"
        ;;

    *)
        usage
        ;;
esac
