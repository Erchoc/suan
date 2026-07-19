PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  display_name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('phone', 'wechat')),
  provider_subject TEXT NOT NULL,
  phone_last_four TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL,
  UNIQUE (provider, provider_subject)
);

CREATE INDEX idx_user_identities_user ON user_identities (user_id, provider);

CREATE TABLE auth_sms_codes (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  code_digest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'consumed', 'exhausted', 'expired', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_message_id TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_auth_sms_phone_created
  ON auth_sms_codes (phone, created_at DESC);

CREATE INDEX idx_auth_sms_status_expires
  ON auth_sms_codes (status, expires_at);

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_user_sessions_user_expires
  ON user_sessions (user_id, expires_at DESC);

CREATE TABLE auth_oauth_states (
  id TEXT PRIMARY KEY,
  state_digest TEXT NOT NULL UNIQUE,
  return_to TEXT NOT NULL,
  current_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_auth_oauth_states_expires
  ON auth_oauth_states (expires_at, consumed_at);
