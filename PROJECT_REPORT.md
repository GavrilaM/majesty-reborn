# Laporan Proyek: Majesty Reborn

## Ringkasan Proyek
**Majesty Reborn** adalah game simulasi strategi real-time (RTS) berbasis otonomi unit (indirect control). Pemain membangun ekonomi dan pertahanan, sementara unit (Hero, Monster, Worker) bergerak dan bertindak secara otomatis berdasarkan AI dan statistik mereka.

---

## Struktur Kode & Fungsi Utama

### 1. Core System (`js/Game.js`)
Pusat logika permainan. Mengatur loop utama, rendering, dan fisika global.
*   **Physics Engine**: Menggunakan sistem *Velocity* dan *Acceleration* untuk gerakan yang cair, bukan teleportasi koordinat.
*   **Collision Resolution**: Mencegah unit saling tumpuk dengan algoritma "Soft Force" (gaya tolak bertahap) dan "Hard Stop" (jika terlalu dekat).
*   **Flow Field Pathfinding**: Sistem navigasi berbasis vektor untuk memandu unit menghindari bangunan dan menemukan pintu masuk dengan mulus.

### 2. Entity AI (`js/entities/`)
Setiap unit memiliki "otak" sendiri berbasis *Finite State Machine* (FSM).

*   **`Hero.js`**:
    *   **State Machine**: `IDLE` (mencari target/belanja), `FIGHT` (bertarung), `RETREAT` (kabur saat sekarat), `SHOP` (beli potion).
    *   **Combat Logic**: Menggunakan sistem *Engagement* (berhenti saat menyerang), *Windup* (ancang-ancang serangan), dan *Cooldown*.
    *   **Personality**: Sifat unit (Brave, Greedy, Smart) mempengaruhi pengambilan keputusan target.

*   **`Monster.js`**:
    *   **Aggro System**: Prioritas target dinamis (1. Pembalasan dendam, 2. Hero terdekat, 3. Siege bangunan).
    *   **Siege Logic**: Mengunci target bangunan untuk waktu tertentu agar tidak bingung (flickering).

*   **`Worker.js`**:
    *   Fokus pada konstruksi dan perbaikan. Memiliki logika "Anchor" untuk diam di tempat saat sedang bekerja.

### 3. Utilitas & Konfigurasi
*   **`js/utils.js`**: Fungsi matematika vektor (jarak, normalisasi, limit) untuk perhitungan fisika.
*   **`js/config/ClassConfig.js`**: Pusat penyeimbangan (balancing) status unit (HP, Damage, Speed, Range).

---

## Progress Terkini

### Status: **Stabilisasi Combat & Fisika**

**Pencapaian:**
1.  **Overhaul Fisika Gerak**: Mengganti gerak kaku menjadi berbasis fisika (Inersia, Gesekan, Percepatan). Unit kini berbelok dan mengerem secara alami.
2.  **Perbaikan "Mosh Pit"**: Unit tidak lagi bergerombol menumpuk di satu titik berkat algoritma separasi yang lebih baik.
3.  **Flow Field Navigation**: Unit dapat berjalan mengitari bangunan tanpa tersangkut.
4.  **Combat Polish**:
    *   Menambahkan animasi "Lunge" (maju sedikit) dan efek "Flash" saat memukul.
    *   Memperbaiki bug unit "Pacifist" (tidak menyerang) dengan memperbaiki logika *Attack Windup*.
    *   Menstabilkan Ranger (menghapus perilaku *kiting* yang buggy).

**Fokus Selanjutnya:**
*   Validasi keseimbangan (balancing) antar kelas unit.
*   Penyempurnaan visual dan UI.
