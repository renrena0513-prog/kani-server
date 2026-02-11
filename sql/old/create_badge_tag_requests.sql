-- タグ申請テーブル
create extension if not exists pgcrypto;

create table if not exists badge_tag_requests (
    id uuid primary key default gen_random_uuid(),
    badge_id text not null,
    requester_id text not null,
    requested_tags text[],
    status text not null default 'pending',
    created_at timestamptz not null default now()
);

create index if not exists badge_tag_requests_status_idx on badge_tag_requests (status, created_at desc);
