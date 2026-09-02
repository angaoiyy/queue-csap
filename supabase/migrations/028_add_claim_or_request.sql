-- Registrar "Claim or Request" field (part 7): a per-office toggle that adds a
-- required "Claim or Request?" dropdown to the public booking form.
--
--   * offices.requires_claim_request - 'false' (default). When true, both the
--     old-student and new-student booking forms show a required dropdown asking
--     whether the student is here to CLAIM a finished document or REQUEST a new
--     one. Registrar is seeded to true so the field is on out of the box; any
--     other office can flip it from Settings > Booking Form.
--   * reservations.claim_or_request  - 'Claim' | 'Request' | NULL. NULL for
--     offices that do not require it.
--
-- Idempotent and safe to re-run.

alter table offices
  add column if not exists requires_claim_request boolean not null default false;

alter table reservations
  add column if not exists claim_or_request text;

do $$ begin
  alter table reservations
    add constraint reservations_claim_or_request_check
    check (claim_or_request in ('Claim', 'Request'));
exception when duplicate_object then null;
end $$;

update offices set requires_claim_request = true where slug = 'registrar';
