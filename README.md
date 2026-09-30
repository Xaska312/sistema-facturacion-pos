# POS SaaS Híbrido - Monorepo

## Fase 0: Esqueleto

### Pre-requisitos
- Docker y Docker Compose instalados.
- Java 21 y Node 22 (opcional, si deseas correr los comandos fuera de Docker).

### Cómo levantar el proyecto
1. Copia `.env.example` a `.env`:
   `cp .env.example .env`
2. Levanta la infraestructura y aplicaciones:
   `docker-compose up --build`
3. Espera a que los tres contenedores estén ejecutándose (`postgres-db`, `backend`, `frontend`).

### Criterios de Aceptación Fase 1
- **Aprovisionamiento**: Al llamar al servicio de creación de negocio, el sistema crea dinámicamente un esquema `t_<slug>`, ejecuta los scripts Flyway de tenant y lo deja listo.
- **Aislamiento**: Las conexiones a base de datos aplican `SET search_path TO t_<slug>` automáticamente según el contexto.