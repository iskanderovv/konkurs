# 🎯 Konkurs Bot

Professional Telegram konkurs boti. NestJS + grammY + PostgreSQL + Prisma.

## 📋 Xususiyatlar

- 📱 Telefon raqam orqali ro'yxatdan o'tish
- 📢 Kanallarga obuna tekshirish (ochiq/yopiq)
- 🔗 Referral tizimi (har bir taklif uchun ball)
- 🏆 Reyting tizimi (Top 10)
- 👮 Admin panel
- 📢 Broadcast (matn, rasm, video + HTML/Markdown)
- 🎲 Konkurs boshqaruvi

## 🚀 Ishga Tushirish

### 1. Loyihani klonlash

```bash
git clone <repository>
cd konkurs-bot
```

### 2. Environment o'zgaruvchilarini sozlash

```bash
cp .env.example .env
```

`.env` faylini tahrirlang:

```env
BOT_TOKEN=your_bot_token_here
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/konkurs_bot
ADMIN_IDS=your_telegram_id
ADMIN_USERNAME=your_username
```

### 3. Dependencies o'rnatish

```bash
npm install
```

### 4. Database yaratish

#### Docker bilan:

```bash
docker-compose up -d postgres
```

#### Yoki oddiy PostgreSQL:

```bash
createdb konkurs_bot
```

### 5. Migration ishga tushirish

```bash
npm run db:migrate
```

### 6. Botni ishga tushirish

#### Development:

```bash
npm run start:dev
```

#### Production:

```bash
npm run build
npm run start:prod
```

## 🐳 Docker bilan ishga tushirish

```bash
# .env faylini yarating va sozlang
cp .env.example .env

# Docker build va run
docker-compose up -d --build
```

## 📱 Bot Buyruqlari

### Foydalanuvchilar uchun:

- `/start` - Botni ishga tushirish
- Menu tugmalari orqali boshqarish

### Adminlar uchun:

- `/admin` - Admin panelga kirish

## 🔧 Admin Panel

Admin panelda quyidagi amallarni bajarish mumkin:

1. **Konkurs boshqaruvi**
   - Yangi konkurs yaratish
   - Konkursni to'xtatish

2. **Kanallar boshqaruvi**
   - Kanal qo'shish (ochiq/yopiq)
   - Kanalni faollashtirish/o'chirish

3. **Xabar yuborish (Broadcast)**
   - Matn
   - Rasm + matn
   - Video + matn
   - HTML formatlash qo'llab-quvvatlanadi

4. **Statistika**
   - Jami ishtirokchilar
   - Jami ballar
   - Kanallar soni

## 📝 Xabar Formatlash

Broadcast uchun HTML teglardan foydalanish mumkin:

```html
<b>Qalin matn</b>
<i>Qiya matn</i>
<u>Chizilgan matn</u>
<code>Kod</code>
<pre>Pre-formatted</pre>
<a href="https://example.com">Link</a>
```

## 📁 Loyiha Strukturasi

```
konkurs-bot/
├── src/
│   ├── bot/           # Bot logikasi
│   ├── user/          # Foydalanuvchilar
│   ├── contest/       # Konkurslar
│   ├── channel/       # Kanallar
│   ├── prisma/        # Database
│   └── config/        # Konfiguratsiya
├── prisma/
│   └── schema.prisma  # Database schema
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## 🔒 Xavfsizlik

- Faqat belgilangan admin ID'lar admin panelga kira oladi
- Telefon raqam faqat Telegram orqali tasdiqlanadi
- Cheating oldini olish uchun cheklovlar mavjud

## 📊 Database

### Models:

- **User** - Foydalanuvchilar
- **Channel** - Kanallar
- **Contest** - Konkurslar
- **PointHistory** - Ball tarixi
- **Admin** - Adminlar
- **Settings** - Sozlamalar
- **BroadcastLog** - Broadcast tarixi

## 🤝 Yordam

Savollar uchun: @${process.env.ADMIN_USERNAME || 'admin'}

---

Made with ❤️ in Uzbekistan
