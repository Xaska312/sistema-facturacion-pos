-- Fase 2: índices para consultas de administración de acceso.
CREATE INDEX ix_member_roles_role ON member_roles (role_id);
CREATE INDEX ix_member_branches_branch ON member_branches (branch_id);
CREATE INDEX ix_members_display_name ON members (lower(display_name));
