# Respaldos de PostgreSQL: pg_dump diario, copia cifrada a Google Drive (rclone crypt) y prueba de restauración.
# Misma versión mayor que el servidor (16): pg_dump no puede respaldar un servidor más nuevo que él.
FROM postgres:16-alpine
RUN apk add --no-cache rclone curl tzdata ca-certificates
COPY common.sh backup.sh restore.sh entrypoint.sh /usr/local/bin/
# Quita CRLF por si la imagen se construye desde una copia de Windows (con CRLF, sh no ejecuta los scripts).
RUN cd /usr/local/bin && sed -i 's/\r$//' common.sh backup.sh restore.sh entrypoint.sh \
    && chmod 0755 common.sh backup.sh restore.sh entrypoint.sh
ENV RCLONE_CONFIG=/config/rclone/rclone.conf
# Lo que borra la retención no pasa por la papelera de Drive (seguiría ocupando espacio ~30 días).
ENV RCLONE_DRIVE_USE_TRASH=false
VOLUME ["/backups"]
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
