# SettleTrack Schema Plan

## Tables

### users
- id
- email
- password_hash
- full_name
- created_at
- updated_at

### businesses
- id
- user_id
- name
- category
- location
- contact_email
- contact_phone
- created_at
- updated_at

### provider_connections
- id
- business_id
- provider
- encrypted_secret_key
- is_active
- created_at
- updated_at

### transactions
- id
- business_id
- provider
- source
- transaction_reference
- amount
- status
- payment_date
- customer_identifier
- settlement_reference
- raw_payload
- created_at
- updated_at

### settlements
- id
- business_id
- provider
- settlement_reference
- settlement_status
- settlement_date
- gross_amount
- provider_fee
- net_amount
- created_at
- updated_at

### reconciliation_runs
- id
- business_id
- status
- started_at
- completed_at
- created_at

### reconciliation_results
- id
- business_id
- reconciliation_run_id
- csv_transaction_id
- provider_transaction_id
- result_type
- reason
- created_at

### audit_logs
- id
- business_id
- user_id
- action
- entity_type
- entity_id
- metadata
- created_at

## Rules
- Every business-owned record must include business_id.
- Provider keys must be encrypted before storage.
- Transaction references must be indexed.
- Reconciliation results must link to reconciliation_runs.
- User data must be tenant-isolated.
- No wallet, money movement, or payment processing tables.
