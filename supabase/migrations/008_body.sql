-- Body measurements per family member, used for BMI, body fat and visceral fat indices.
alter table public.members add column if not exists height_cm numeric(5,1) check (height_cm is null or height_cm between 40 and 260);
alter table public.members add column if not exists weight_kg numeric(5,1) check (weight_kg is null or weight_kg between 2 and 400);
alter table public.members add column if not exists waist_cm numeric(5,1) check (waist_cm is null or waist_cm between 30 and 250);
alter table public.members add column if not exists body_measured_at timestamptz;
