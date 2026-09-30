-- Creación del schema de plataforma inicial
CREATE SCHEMA IF NOT EXISTS platform;

-- Extensión para generación de UUIDs si es necesario a futuro
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA platform;