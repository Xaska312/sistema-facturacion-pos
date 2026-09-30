CREATE TABLE platform.users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ACTIVE',
    failed_attempts INT DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE platform.tenants (
    id UUID PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    schema_name VARCHAR(50) UNIQUE NOT NULL,
    legal_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    business_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'PROVISIONING',
    owner_user_id UUID REFERENCES platform.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE platform.memberships (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES platform.users(id),
    tenant_id UUID REFERENCES platform.tenants(id),
    status VARCHAR(50) DEFAULT 'ACTIVE',
    UNIQUE(user_id, tenant_id)
);