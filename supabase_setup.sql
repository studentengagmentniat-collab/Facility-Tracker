-- Run this in Supabase SQL Editor

-- Profiles table
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  role text default 'requester',
  email text
);
alter table profiles enable row level security;
create policy "Public profiles" on profiles for all using (true);

-- Requests table
create table requests (
  id uuid default gen_random_uuid() primary key,
  req_id text unique,
  title text,
  dept text,
  status text default 'raised',
  pr_number text,
  product_name text,
  product_link text,
  unit_cost numeric,
  qty integer,
  total_cost numeric,
  notes text,
  created_by text,
  created_by_email text,
  created_at timestamptz default now()
);
alter table requests enable row level security;
create policy "All requests" on requests for all using (true);

-- Remarks table
create table remarks (
  id uuid default gen_random_uuid() primary key,
  request_id uuid references requests on delete cascade,
  text text,
  added_by text,
  added_by_email text,
  created_at timestamptz default now()
);
alter table remarks enable row level security;
create policy "All remarks" on remarks for all using (true);

-- Updates / notifications table
create table updates (
  id uuid default gen_random_uuid() primary key,
  request_id uuid references requests on delete cascade,
  req_id text,
  title text,
  status text,
  status_label text,
  remark text,
  updated_by text,
  created_at timestamptz default now()
);
alter table updates enable row level security;
create policy "All updates" on updates for all using (true);

-- Enable realtime
alter publication supabase_realtime add table requests;
alter publication supabase_realtime add table remarks;
alter publication supabase_realtime add table updates;
