CREATE TABLE nonce_operation_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_nonce TEXT NOT NULL,
    operation_key TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_nonce)
);

CREATE INDEX nonce_operation_map_operation_type_client_nonce_idx ON nonce_operation_map (operation_type, client_nonce);
