# PKS Bandung Kulon — Aplikasi Chat (versi Supabase)

Aplikasi chat berbasis internet, tanpa aplikasi WhatsApp. Setiap yang daftar pakai
nomor HP sendiri sebagai identitas (tanpa verifikasi OTP). Fitur: chat pribadi, grup, dan pengumuman admin.
Data disimpan di Supabase (database sungguhan, gratis untuk skala ini).

## Cara setup (semua bisa dari HP)

### 1. Buat project Supabase
1. Buka supabase.com -> daftar/masuk -> **New project**.
2. Kasih nama bebas (misal `pks-bandung-kulon`), pilih region Singapore (paling dekat).
3. Catat kata sandi database yang kamu buat (simpan baik-baik).
4. Tunggu sampai project selesai dibuat (1-2 menit).

### 2. Jalankan skema database
1. Di project Supabase, buka menu **SQL Editor** -> **New query**.
2. Buka file `supabase-schema.sql` dari folder ini, copy semua isinya, paste ke sana.
3. Tekan **Run**. Kalau berhasil akan muncul "Success. No rows returned".

### 3. Ambil kunci API
1. Di Supabase, buka **Project Settings -> API**.
2. Catat:
   - **Project URL** (contoh: `https://xxxxx.supabase.co`)
   - **service_role key** (rahasia, jangan dibagikan ke publik -- dipakai backend)
   - **anon public key** (ini memang dirancang untuk ditempel di kode frontend, aman)

### 4. Isi 2 baris di index.html (supaya bisa kirim gambar/file)
Buka `index.html`, cari bagian ini di dekat awal tag `<script>`, dan ganti dengan punyamu:
```
const SUPABASE_URL_PUBLIC = "https://GANTI-DENGAN-PROJECT-URL.supabase.co";
const SUPABASE_ANON_KEY_PUBLIC = "GANTI-DENGAN-ANON-KEY";
```

### 5. Upload ke GitHub
Upload semua isi folder ini ke repo GitHub (akun `Deden-bot950`), termasuk:
`index.html`, `netlify.toml`, `package.json`, folder `netlify/`, folder `assets/`.

### 6. Deploy di Netlify
1. Connect repo ke Netlify seperti biasa.
2. Di **Site settings -> Environment variables**, tambahkan:
   - `SUPABASE_URL` = Project URL dari langkah 3
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key dari langkah 3
   - `ADMIN_PASSWORD` = kata sandi bebas untuk kirim pengumuman (ganti dari default!)
3. Deploy. Netlify otomatis install library Supabase (dari `package.json`).

### 7. Coba pakai
- Daftar akun baru pakai nama, nomor HP, dan kata sandi -> nomor HP itu jadi identitas untuk masuk & dihubungi orang lain.
- Tekan tombol **+** di kanan bawah untuk mulai chat pribadi, buat/gabung grup, atau kirim pengumuman (admin).
- Tekan ikon 📎 di sebelah kotak pesan untuk kirim gambar, dokumen, atau video (maks 20 MB per file).

## Tentang kirim gambar/file
- File diunggah langsung dari HP ke **Supabase Storage** (bucket `chat-media`), lalu linknya dikirim sebagai pesan.
- Bucket ini dibuat otomatis lewat `supabase-schema.sql` (langkah 2), termasuk aturan supaya semua anggota bisa upload & lihat file.
- Kuota gratis Supabase Storage: **1 GB total**. Cukup untuk ribuan foto ukuran normal;
  kalau makin ramai dan penuh, tinggal upgrade plan Supabase atau saya bantu tambahkan
  kompresi gambar otomatis sebelum upload.
- Batas 20 MB per file sudah diatur di `index.html` (`MAX_FILE_MB`) -- bisa diubah kalau perlu.

## Kenapa pindah dari JSONBin ke Supabase?
- Database sungguhan -> tidak ada batas ukuran kecil seperti JSONBin bin gratis.
- Lebih tahan dipakai banyak orang sekaligus (tidak ada masalah "pesan tertimpa").
- Siap dikembangkan lebih jauh nanti, misalnya realtime instan (tanpa jeda 3-4 detik) memakai fitur Supabase Realtime.

## Catatan keamanan
- Kata sandi user masih disimpan apa adanya (belum di-hash). Cukup aman untuk komunitas
  tertutup skala kecil-menengah, tapi kalau makin serius, bilang saja -- saya bisa tambahkan
  hashing password (bcrypt) tanpa mengubah cara pakainya.
- `service_role key` Supabase itu kunci penuh ke database -- jangan sampai bocor ke publik atau
  dipakai di kode frontend. Di sini sudah aman karena hanya dipakai di Netlify Function (server),
  bukan di `index.html`.
