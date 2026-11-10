-- Usuário da replicação por streaming (réplica postgres-2). Senha de desenvolvimento, como as
-- demais credenciais do compose: o banco só escuta no localhost do laptop.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replicador') THEN
    CREATE ROLE replicador WITH REPLICATION LOGIN PASSWORD 'replicador';
  END IF;
END
$$;
