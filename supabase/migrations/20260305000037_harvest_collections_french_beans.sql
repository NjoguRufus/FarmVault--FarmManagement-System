-- Add French beans / picker-based collection fields to harvest.harvest_collections.
-- Ensures create flow can set crop_type, price_per_kg (picker), and notes.

begin;

alter table harvest.harvest_collections
  add column if not exists crop_type text null,
  add column if not exists price_per_kg numeric null,
  add column if not exists notes text null;

comment on column harvest.harvest_collections.crop_type is 'e.g. french_beans for picker-based collections';
comment on column harvest.harvest_collections.price_per_kg is 'Picker rate per kg (optional, used for totals)';
comment on column harvest.harvest_collections.notes is 'Optional session notes';

commit;
