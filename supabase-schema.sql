-- Jalankan file ini di Supabase: Project -> SQL Editor -> New query -> paste -> Run

-- (Sequence user_id_seq TIDAK dipakai lagi -- ID user sekarang nomor HP yang diisi sendiri saat daftar)
create sequence if not exists user_id_seq start 1;
-- Sequence untuk kode grup (g_0001, g_0002, ...) -- ini tetap dipakai
create sequence if not exists group_id_seq start 1;

create table if not exists users (
  id text primary key,               -- nomor HP, contoh: '628123456789' (angka saja, tanpa spasi/simbol)
  name text not null,
  password text not null,            -- catatan: belum di-hash, lihat SETUP.md
  created_at timestamptz default now()
);

create table if not exists conversations (
  id text primary key,               -- 'p_0001_0002' untuk pribadi, 'g_0001' untuk grup
  type text not null check (type in ('private','group')),
  name text,                         -- dipakai untuk grup
  admin_id text references users(id),
  created_at timestamptz default now()
);

create table if not exists conversation_members (
  conversation_id text references conversations(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id bigserial primary key,
  conversation_id text references conversations(id) on delete cascade,
  from_id text references users(id),
  from_name text not null,
  text text not null default '',
  media_url text,                    -- link file di Supabase Storage (gambar/dokumen/video)
  media_type text,                   -- mime type, contoh: image/jpeg, application/pdf, video/mp4
  file_name text,                    -- nama file asli, dipakai untuk tampilan dokumen
  created_at timestamptz default now()
);

create table if not exists announcements (
  id bigserial primary key,
  text text not null,
  created_at timestamptz default now()
);

-- Index biar query cepat
create index if not exists idx_messages_convo on messages(conversation_id, created_at);
create index if not exists idx_members_user on conversation_members(user_id);

-- Fungsi bantu supaya kode backend bisa ambil nomor urut berikutnya
create or replace function nextval_public(seq_name text) returns bigint as $$
begin
  return nextval(seq_name);
end;
$$ language plpgsql;

-- Catatan: tabel-tabel ini diakses lewat Netlify Function pakai Service Role Key
-- (bukan langsung dari browser), jadi Row Level Security tidak wajib diaktifkan.
-- Kalau nanti mau akses langsung dari browser juga, aktifkan RLS dan buat policy dulu.

-- ====== BUCKET UNTUK KIRIM GAMBAR / DOKUMEN / VIDEO ======
-- Bucket dibuat lewat Dashboard (Storage -> New bucket), bukan lewat SQL, lihat SETUP.md.
-- Setelah bucket 'chat-media' dibuat, jalankan policy berikut supaya semua anggota
-- (yang pakai kode nomor, bukan Supabase Auth) bisa upload & lihat file:

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

drop policy if exists "chat-media public read" on storage.objects;
create policy "chat-media public read"
on storage.objects for select
using (bucket_id = 'chat-media');

drop policy if exists "chat-media public upload" on storage.objects;
create policy "chat-media public upload"
on storage.objects for insert
with check (bucket_id = 'chat-media');
