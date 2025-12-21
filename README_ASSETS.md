# Majesty Reborn - Panduan & Laporan untuk Developer Aset

## Progress: 5% (Pre-Alpha)
Proyek ini masih dalam tahap **awal (5%)** karena fokus utama saat ini adalah **Core Gameplay Mechanics** dan **Physics Engine**. Kami baru saja menyelesaikan fondasi dasar untuk:
*   Sistem pergerakan otonom (AI) yang cerdas.
*   Logika pertarungan dan ekonomi dasar.
*   Fisika tabrakan dan pathfinding.

Karena mekanik dasar ini sangat kompleks dan krusial, visual (grafik) sengaja dibiarkan dalam bentuk placeholder sederhana agar debugging lebih mudah dan cepat.

### Roadmap Implementasi Kedepan
Berikut adalah rencana pengembangan selanjutnya setelah aset visual siap:
1.  Integrasi Aset Visual: Mengganti kotak/lingkaran dengan Sprite 2D yang telah dibuat.
2.  Sistem Animasi: Menerapkan sprite sheet untuk animasi berjalan, menyerang, dan mati.
3.  UI Overhaul: Mendesain ulang antarmuka pengguna agar lebih intuitif dan sesuai tema fantasi.
4.  Audio & SFX: Menambahkan suara langkah kaki, serangan, dan musik latar dll.
5. polishing hero logic. (skill, behavior, interaction, ect)
6.  Ekspansi Konten: Menambah variasi Hero (Wizard, Paladin), Monster (Boss, Undead), dan Bangunan (Blacksmith, Library).
7.  Optimasi Performance: Memperbaiki rendering dan fisika untuk menangani banyak unit dan bangunan. (angel wi soale js)
8. main GUI, main menu, levels, dstt
9. level designing
10. polishing game mechanics. (balance, flow, ect)
11. final testing and bug fixing.
12. polish game graphics. (visual, audio, ui, ect)
13. story and game design. (plot, world, character, ect)

---

## Ringkasan Proyek
**Majesty Reborn** adalah game simulasi strategi real-time (RTS) "Indirect Control". Pemain tidak mengendalikan unit secara langsung, melainkan membangun ekonomi dan memberi insentif (Flag/Bounty) agar unit (Hero) bergerak sendiri.

Saat ini, game menggunakan **Placeholder Graphics** (bentuk geometri sederhana yang digambar dengan kode). Kami membutuhkan aset visual (Sprite 2D) untuk menggantikan bentuk-bentuk ini agar game terlihat hidup dan profesional.

---

## Status Teknis Saat Ini
*   **Engine**: Custom JS Engine (Canvas API).
*   **Fisika**: Unit bergerak menggunakan sistem Velocity/Acceleration yang cair (bukan grid-based kaku).
*   **Perspektif**: Top-Down 2D (seperti *Rimworld* atau *Prison Architect*, bukan isometrik murni).
*   **Sistem Animasi**: Saat ini belum ada sistem animasi sprite sheet, hanya perubahan posisi dan warna.

---

## Kebutuhan Aset (Asset Requirements)

Kami membutuhkan aset Pixel Art atau 2D Vector yang konsisten.

### 1. Karakter (Units)
Semua karakter dilihat dari sudut pandang **Top-Down**.
*   **Ukuran Grid Dasar**: Unit kira-kira menempati area 32x32 pixel (Standard) atau 64x64 pixel (Large).
*   **Format**: PNG (Transparent Background).

#### Daftar Unit:
1.  **Warrior (Hero)**
    *   *Style*: Armor berat, pedang, tameng. Warna dominan: Biru.
    *   *Animasi*: Idle, Walk (4 arah atau 8 arah), Attack (Melee swing), Die.
2.  **Ranger (Hero)**
    *   *Style*: Jubah hijau, busur panah. Warna dominan: Hijau.
    *   *Animasi*: Idle, Walk, Attack (Shooting bow), Die.
3.  **Worker (Peasant)**
    *   *Style*: Baju sederhana, membawa palu.
    *   *Animasi*: Idle, Walk, Build (memukul palu).
4.  **Monster (Enemy)**
    *   **Goblin/Swarm**: Kecil, cepat, bergerombol. (Ukuran ~24px).
    *   **Tank/Ogre**: Besar, lambat, tebal. (Ukuran ~64px).

### 2. Bangunan (Buildings)
Bangunan bersifat statis. Perlu variasi visual untuk tahap konstruksi.

1.  **Castle (Main Base)**
    *   Ukuran: Besar (misal 128x128 atau 160x160).
    *   Pintu masuk harus terlihat jelas di bagian depan/bawah.
2.  **Guilds (Warrior & Ranger Guild)**
    *   Ukuran: Sedang (64x64 atau 96x96).
    *   Tempat hero spawn.
3.  **Market**
    *   Ukuran: Sedang.
    *   Memiliki area interaksi (toko).
4.  **Tower (Defense)**
    *   Ukuran: Kecil-Sedang (48x48).
    *   Tinggi, menembakkan panah.

**Catatan Khusus Bangunan**:
*   Sediakan versi **"Under Construction"** (misal: hanya pondasi kayu) untuk setiap bangunan.
*   Sediakan versi **"Ruined"** (hancur) jika bangunan 0 HP.

### 3. UI & Efek (VFX)
1.  **Icons**:
    *   Gold (Koin Emas).
    *   Potion (Botol Merah).
    *   Flag/Bounty (Bendera Tongkat).
2.  **Particles**:
    *   Damage hit (percikan darah/cahaya).
    *   Level Up (kilauan ke atas).
    *   Projectile (Panah, Batu).

---

## Panduan Implementasi (Untuk Programmer Integrasi)
*   Saat ini rendering ada di `js/utils.js` -> `drawSprite`.
*   Nantinya, fungsi ini akan diganti untuk menggambar `Image` dari `SpriteSheet`.
*   Setiap entity memiliki properti `this.vel` (velocity). Gunakan ini untuk menentukan arah hadap sprite (kiri/kanan/atas/bawah).
    *   Jika `vel.x > 0` -> Flip Right.
    *   Jika `vel.x < 0` -> Flip Left.

---
