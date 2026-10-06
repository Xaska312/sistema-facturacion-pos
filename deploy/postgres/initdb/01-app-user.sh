#!/bin/sh
# Se ejecuta una sola vez, cuando PostgreSQL arranca con el volumen vacío.
# Crea el usuario de la aplicación sin privilegios de superusuario y lo hace dueño de la base:
# puede crear los schemas de cada negocio (t_<slug>) y migrarlos, pero no tocar otras bases ni el servidor.
# Sin "set -e" propio: si el archivo pierde el permiso de ejecución, la imagen de postgres lo carga con "."
# dentro de su propio script, y ON_ERROR_STOP ya detiene la inicialización ante cualquier error.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" -v db="$POSTGRES_DB" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE :"db" OWNER TO :"app_user";
SQL

echo "Usuario de la aplicación \"$APP_DB_USER\" creado y dueño de la base \"$POSTGRES_DB\"."
