// ==================== EMOJI ====================
export const EMOJI = {
    // Status
    CHECK: '✅',
    CROSS: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',

    // Actions
    CONTEST: '🎲',
    GIFT: '🎁',
    POINTS: '💰',
    RATING: '🏆',
    TERMS: '📋',
    CONTACT: '📞',
    BACK: '◀️',
    REFRESH: '🔄',

    // Ranks
    GOLD: '🥇',
    SILVER: '🥈',
    BRONZE: '🥉',

    // Other
    PHONE: '📱',
    LINK: '🔗',
    CALENDAR: '📅',
    CLOCK: '⏱️',
    USERS: '👥',
    DIAMOND: '💎',
    STAR: '⭐',
    FIRE: '🔥',
    ROCKET: '🚀',
    ADMIN: '👮',
    CHANNEL: '📢',
    MESSAGE: '💬',
    SETTINGS: '⚙️',
    STATS: '📊',
};

// ==================== MESSAGES ====================
export const MESSAGES = {
    // Start
    WELCOME: `🎯 <b>Konkurs Botga Xush Kelibsiz!</b>

Konkursda qatnashish uchun quyidagi amallarni bajaring:

1️⃣ Telefon raqamingizni tasdiqlang
2️⃣ Kanallarga obuna bo'ling
3️⃣ Do'stlaringizni taklif qilib ball to'plang!

Har bir do'stingiz uchun <b>+5 ball</b> olasiz! 🎉`,

    WELCOME_BACK: `🎯 <b>Qaytib kelganingizdan xursandmiz!</b>

Asosiy menuni tanlang:`,

    // Phone
    SEND_PHONE: `${EMOJI.PHONE} <b>Telefon raqamingizni tasdiqlang</b>

Davom etish uchun "📱 Raqamni yuborish" tugmasini bosing.`,

    PHONE_RECEIVED: `${EMOJI.CHECK} <b>Telefon raqamingiz tasdiqlandi!</b>

Endi kanallarga obuna bo'lishingiz kerak.`,

    INVALID_PHONE: `${EMOJI.CROSS} Iltimos, telefon raqamingizni "📱 Raqamni yuborish" tugmasi orqali yuboring.`,

    // Channels
    SUBSCRIBE_CHANNELS: `${EMOJI.CHANNEL} <b>Kanallarga obuna bo'ling</b>

Konkursda qatnashish uchun quyidagi kanallarga obuna bo'lishingiz shart:`,

    ALL_SUBSCRIBED: `${EMOJI.CHECK} <b>Tabriklaymiz!</b>

Siz barcha kanallarga obuna bo'ldingiz va konkursga muvaffaqiyatli qo'shildingiz! 🎉

Endi do'stlaringizni taklif qilib ball to'plashingiz mumkin.`,

    NOT_SUBSCRIBED: `${EMOJI.CROSS} <b>Siz hali barcha kanallarga obuna bo'lmadingiz!</b>

Iltimos, quyidagi kanallarga obuna bo'ling:`,

    NO_CHANNELS: `${EMOJI.WARNING} Hozircha obuna bo'lish kerak bo'lgan kanallar yo'q.`,

    // Contest
    NO_ACTIVE_CONTEST: `${EMOJI.INFO} Hozircha faol konkurs yo'q.

Yangi konkurs e'lon qilinishi bilan sizga xabar beramiz! 🔔`,

    // Points
    YOUR_POINTS: (points: number, referralCount: number) =>
        `${EMOJI.POINTS} <b>Sizning ballaringiz</b>

${EMOJI.DIAMOND} Jami ball: <b>${points}</b> ball
${EMOJI.USERS} Taklif qilganlar: <b>${referralCount}</b> ta

💡 Har bir do'stingiz = +5 ball`,

    // Rating
    RATING_HEADER: `${EMOJI.RATING} <b>REYTING (TOP 10)</b>\n`,

    YOUR_RANK: (rank: number, points: number) =>
        `\n━━━━━━━━━━━━━━━━━━━━━
${EMOJI.INFO} Sizning o'rningiz: <b>#${rank}</b>
${EMOJI.DIAMOND} Sizning ballingiz: <b>${points}</b> ball`,

    // Terms
    TERMS_TEXT: `${EMOJI.TERMS} <b>KONKURS SHARTLARI</b>

${EMOJI.CHECK} <b>Ruxsat etilgan:</b>
• Do'stlarni taklif qilish
• Ijtimoiy tarmoqlarda ulashish

${EMOJI.CROSS} <b>Taqiqlangan:</b>
• Soxta akkauntlar yaratish
• Bot orqali ro'yxatdan o'tkazish
• Bitta qurilmadan bir nechta akkaunt

${EMOJI.WARNING} <b>Ogohlantirish:</b>
Cheating aniqlansa, ishtirokchi konkursdan chetlatiladi va barcha ballari bekor qilinadi.

📌 <b>Qoidalar buzilsa:</b>
1-marta: Ogohlantirish
2-marta: Ballar nolga tushadi
3-marta: Doimiy bloklash`,

    // Contact
    CONTACT_TEXT: (adminUsername: string, channelUsername?: string, groupUsername?: string) => {
        let text = `${EMOJI.CONTACT} <b>ALOQA</b>

Savollar va takliflar uchun:

👤 Admin: @${adminUsername}
📱 Telegram: t.me/${adminUsername}`;

        if (channelUsername) {
            text += `\n\n${EMOJI.CHANNEL} Rasmiy kanal: @${channelUsername}`;
        }
        if (groupUsername) {
            text += `\n${EMOJI.MESSAGE} Guruh: @${groupUsername}`;
        }

        text += `\n\n⏰ Javob berish vaqti: 09:00 - 21:00`;
        return text;
    },

    // Errors
    ERROR: `${EMOJI.CROSS} Xatolik yuz berdi. Iltimos, qayta urinib ko'ring.`,
    BANNED: `${EMOJI.CROSS} Siz bloklangansiz va konkursda qatnasha olmaysiz.`,

    // Admin
    ADMIN_WELCOME: `${EMOJI.ADMIN} <b>Admin Panel</b>

Quyidagi amallardan birini tanlang:`,

    ADMIN_STATS: (
        totalUsers: number,
        totalPoints: number,
        totalChannels: number,
        hasActiveContest: boolean,
    ) =>
        `${EMOJI.STATS} <b>Statistika</b>

${EMOJI.USERS} Jami ishtirokchilar: <b>${totalUsers}</b>
${EMOJI.DIAMOND} Jami ballar: <b>${totalPoints}</b>
${EMOJI.CHANNEL} Kanallar soni: <b>${totalChannels}</b>
${EMOJI.CONTEST} Faol konkurs: <b>${hasActiveContest ? 'Ha' : 'Yo\'q'}</b>`,

    NOT_ADMIN: `${EMOJI.CROSS} Sizda admin huquqlari yo'q.`,

    // Broadcast
    BROADCAST_SELECT_TYPE: `${EMOJI.MESSAGE} <b>Xabar turini tanlang:</b>`,
    BROADCAST_SEND_TEXT: `📝 Xabar matnini yuboring.

<b>Formatlash:</b>
• &lt;b&gt;Qalin&lt;/b&gt;
• &lt;i&gt;Qiya&lt;/i&gt;
• &lt;code&gt;Kod&lt;/code&gt;
• &lt;a href="url"&gt;Link&lt;/a&gt;`,
    BROADCAST_SEND_PHOTO: `🖼 Rasm va unga matn yuboring.`,
    BROADCAST_SEND_VIDEO: `🎬 Video va unga matn yuboring.`,
    BROADCAST_CONFIRM: (count: number) =>
        `${EMOJI.WARNING} <b>Tasdiqlang</b>

Xabar <b>${count}</b> ta foydalanuvchiga yuboriladi.

Davom etasizmi?`,
    BROADCAST_STARTED: `${EMOJI.ROCKET} Xabarlar yuborilmoqda...`,
    BROADCAST_COMPLETE: (sent: number, failed: number) =>
        `${EMOJI.CHECK} <b>Yuborish tugadi!</b>

${EMOJI.CHECK} Yuborildi: <b>${sent}</b>
${EMOJI.CROSS} Xatolik: <b>${failed}</b>`,

    // Channel management
    CHANNEL_LIST: `${EMOJI.CHANNEL} <b>Kanallar ro'yxati</b>\n`,
    CHANNEL_ADD: `${EMOJI.CHANNEL} Kanal qo'shish

<b>Quyidagilardan birini yuboring:</b>
• Username: @kanal_username
• Kanal ID: -1001234567890
• Link: https://t.me/kanal_username

<i>Bot kanalda admin bo'lishi kerak!</i>`,
    CHANNEL_ADDED: (title: string) => `${EMOJI.CHECK} Kanal qo'shildi: <b>${title}</b>`,
    CHANNEL_REMOVED: `${EMOJI.CHECK} Kanal o'chirildi.`,
    CHANNEL_NOT_FOUND: `${EMOJI.CROSS} Kanal topilmadi. Bot kanalda admin ekanligini tekshiring.`,
    CHANNEL_EXISTS: `${EMOJI.WARNING} Bu kanal allaqachon qo'shilgan.`,

    // Contest management
    CONTEST_ENTER_TITLE: `${EMOJI.CONTEST} Konkurs nomini kiriting:`,
    CONTEST_ENTER_DESC: `📝 Konkurs tavsifini kiriting:`,
    CONTEST_ENTER_PRIZES: `${EMOJI.GIFT} Sovrinlar ro'yxatini kiriting:`,
    CONTEST_ENTER_DATE: `${EMOJI.CALENDAR} Tugash sanasini kiriting (format: YYYY-MM-DD HH:MM):`,
    CONTEST_CREATED: `${EMOJI.CHECK} Konkurs muvaffaqiyatli yaratildi!`,
    CONTEST_INVALID_DATE: `${EMOJI.CROSS} Noto'g'ri sana formati. Iltimos, YYYY-MM-DD HH:MM formatida kiriting.`,
};
