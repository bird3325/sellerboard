-- Products Table Schema
-- Run this in your Supabase SQL Editor

create table if not exists public.products (
    id uuid default gen_random_uuid() primary key,
    -- user_id is required. If you have authentication set up, use auth.uid()
    -- If not, you might need to remove 'not null' or provide a default value.
    -- For now, we assume the user is authenticated or this will be handled by RLS.
    user_id uuid references auth.users default auth.uid(),
    
    -- Basic Info
    name text,
    original_name text,
    category text,
    platform text, 
    status text default 'draft', -- draft, active, out_of_stock
    
    -- Price Info
    price numeric default 0, -- KRW
    cost numeric default 0, -- KRW
    collected_price numeric default 0, -- USD (or original currency)
    stock int default 0,
    
    -- Sourcing Info
    sourcing_url text,
    
    -- Media & Details
    image_url text, -- Main image
    images text[], -- Additional images
    description text, -- HTML content
    
    -- Structured Data
    options jsonb default '[]'::jsonb,
    specs jsonb default '[]'::jsonb,
    
    -- Timestamps
    collected_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    -- Logs
    transmission_log jsonb default '{}'::jsonb
);

-- Enable RLS
alter table public.products enable row level security;

-- Create policy to allow users to see and manage their own products
create policy "Users can view their own products"
on public.products for select
using (auth.uid() = user_id);

create policy "Users can insert their own products"
on public.products for insert
with check (auth.uid() = user_id);

create policy "Users can update their own products"
on public.products for update
using (auth.uid() = user_id);

create policy "Users can delete their own products"
on public.products for delete
using (auth.uid() = user_id);
