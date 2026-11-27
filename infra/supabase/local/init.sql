-- Supabase Auth migrations grant read access to the standard postgres role.
CREATE ROLE postgres NOLOGIN;
CREATE DATABASE email_auth;
\connect email_auth
CREATE SCHEMA auth;
ALTER DATABASE email_auth SET search_path = auth, public;
