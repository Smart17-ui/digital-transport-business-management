-- The Edge Functions' Postgres driver encoded JSON parameters a second time, so
-- these columns held a JSON string containing the JSON instead of the JSON itself.
-- Handlers now cast the parameter through text. This repairs what was written and
-- makes the database refuse it from now on, whichever driver does the writing.
--
-- Deploy the fixed Edge Functions before applying this, or the old ones will fail
-- the new constraints.

-- Only the encoding changes here, not the agreed terms, so the terms guard stays off for this one update.
alter table arrangements disable trigger arrangements_guard;
update arrangements set terms = (terms #>> '{}')::jsonb where jsonb_typeof(terms) = 'string';
alter table arrangements enable trigger arrangements_guard;

update command_log set result = (result #>> '{}')::jsonb where jsonb_typeof(result) = 'string';
update outbox set payload = (payload #>> '{}')::jsonb where jsonb_typeof(payload) = 'string';

-- settlements and audit_entries are append-only and had no rows when this was written,
-- so they get the constraint without a repair. A stray row would fail this migration visibly.
alter table arrangements add constraint arrangements_terms_object check (jsonb_typeof(terms) = 'object');
alter table command_log add constraint command_log_result_object check (jsonb_typeof(result) = 'object');
alter table outbox add constraint outbox_payload_object check (jsonb_typeof(payload) = 'object');
alter table settlements add constraint settlements_statement_object check (jsonb_typeof(statement) = 'object');
alter table audit_entries add constraint audit_entries_details_object check (jsonb_typeof(details) = 'object');
