CREATE TABLE roles (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE permissions (
    code VARCHAR(100) PRIMARY KEY,
    description TEXT
);

CREATE TABLE role_permissions (
    role_code VARCHAR(50) REFERENCES roles(code),
    permission_code VARCHAR(100) REFERENCES permissions(code),
    PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE members (
    id UUID PRIMARY KEY, -- Coincide con platform.users.id
    display_name VARCHAR(255) NOT NULL,
    active BOOLEAN DEFAULT true
);

-- Semilla de roles base
INSERT INTO roles (code, name, description) VALUES 
('OWNER', 'Propietario', 'Acceso total al sistema'),
('ADMIN', 'Administrador', 'Gestión de negocio sin facturación de suscripción'),
('CASHIER', 'Cajero', 'Apertura/cierre de caja y ventas');