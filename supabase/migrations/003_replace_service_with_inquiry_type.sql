alter table reservations
add column if not exists inquiry_type text;

update reservations
set inquiry_type = coalesce(service, 'Other Inquiry')
where inquiry_type is null;

alter table reservations
alter column inquiry_type set not null;

drop index if exists idx_reservations_service_status;
drop index if exists idx_reservations_position;

create index if not exists idx_reservations_inquiry_type_status
  on reservations(inquiry_type, status);
create index if not exists idx_reservations_inquiry_type_position
  on reservations(inquiry_type, position);

alter table reservations
drop column if exists service;
