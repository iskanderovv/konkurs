import { InlineKeyboard, Keyboard } from 'grammy';
import { Channel } from '@prisma/client';
import { EMOJI } from '../constants';

// ==================== MAIN MENU ====================

export const getMainMenuKeyboard = (): Keyboard => {
    return new Keyboard()
        .text(`${EMOJI.CONTEST} Konkursda qatnashish`)
        .row()
        .text(`${EMOJI.GIFT} Sovg'alar`)
        .text(`${EMOJI.POINTS} Ballarim`)
        .row()
        .text(`${EMOJI.RATING} Reyting`)
        .text(`${EMOJI.TERMS} Shartlar`)
        .row()
        .text(`${EMOJI.CONTACT} Aloqa`)
        .resized()
        .persistent();
};

// ==================== PHONE REQUEST ====================

export const getPhoneKeyboard = (): Keyboard => {
    return new Keyboard()
        .requestContact(`${EMOJI.PHONE} Raqamni yuborish`)
        .resized()
        .oneTime();
};

// ==================== CHANNELS ====================

export const getChannelsKeyboard = (channels: Channel[]): InlineKeyboard => {
    const keyboard = new InlineKeyboard();

    channels.forEach((channel, index) => {
        let channelLink: string;

        // Agar inviteLink mavjud bo'lsa, uni ishlatish (xususiy kanallar uchun)
        if (channel.inviteLink) {
            channelLink = channel.inviteLink;
        } else if (channel.channelId.startsWith('@')) {
            channelLink = `https://t.me/${channel.channelId.slice(1)}`;
        } else {
            // Link yo'q bo'lsa, noto'g'ri URL ("https://t.me/") qaytarmaslik kerak
            // Chunki bu telegram.org ga olib boradi
            // Vaqtinchalik yechim: kanal ID sini ko'rsatish (ishlamaydigan link bo'lsa ham)
            // Yoki agar bu private kanal bo'lsa va linki yo'q bo'lsa, admin panelda yangilash kerak
            channelLink = 'https://t.me/telegram'; // Default xavfsiz link
        }

        keyboard.url(`${index + 1}. ${channel.title}`, channelLink).row();
    });

    keyboard.text(`${EMOJI.CHECK} Tekshirish`, 'check_subscription');

    return keyboard;
};

// ==================== BACK BUTTON ====================

export const getBackKeyboard = (): InlineKeyboard => {
    return new InlineKeyboard().text(`${EMOJI.BACK} Orqaga`, 'back_to_menu');
};

// ==================== ADMIN MENU ====================

export const getAdminMenuKeyboard = (): InlineKeyboard => {
    return new InlineKeyboard()
        .text(`${EMOJI.CONTEST} Konkurs`, 'admin_contest')
        .text(`${EMOJI.CHANNEL} Kanallar`, 'admin_channels')
        .row()
        .text(`${EMOJI.MESSAGE} Xabar yuborish`, 'admin_broadcast')
        .row()
        .text(`${EMOJI.TERMS} Shartlar`, 'admin_terms')
        .text(`${EMOJI.CONTACT} Aloqa`, 'admin_contact')
        .row()
        .text(`${EMOJI.USERS} Foydalanuvchilar`, 'admin_users')
        .text(`${EMOJI.STATS} Statistika`, 'admin_stats');
};

// ==================== ADMIN CONTEST ====================

export const getAdminContestKeyboard = (hasActiveContest: boolean): InlineKeyboard => {
    const keyboard = new InlineKeyboard();

    if (hasActiveContest) {
        keyboard
            .text(`📝 Tahrirlash`, 'contest_edit')
            .text(`🔴 To'xtatish`, 'contest_stop')
            .row();
    } else {
        keyboard.text(`➕ Yangi konkurs`, 'contest_create').row();
    }

    keyboard.text(`${EMOJI.BACK} Orqaga`, 'admin_back');
    return keyboard;
};

// ==================== ADMIN CHANNELS ====================

export const getAdminChannelsKeyboard = (channels: Channel[]): InlineKeyboard => {
    const keyboard = new InlineKeyboard();

    channels.forEach((channel) => {
        const status = channel.isActive ? '🟢' : '🔴';
        const type = channel.isPrivate ? '🔒' : '🌐';
        // Toggle va Delete tugmalari bir qatorda
        keyboard.text(`${status} ${type} ${channel.title.slice(0, 15)}`, `toggle_channel_${channel.id}`);
        keyboard.text('🗑', `delete_channel_${channel.id}`);
        keyboard.row();
    });

    keyboard
        .text(`➕ Kanal qo'shish`, 'add_channel')
        .row()
        .text(`${EMOJI.BACK} Orqaga`, 'admin_back');

    return keyboard;
};

// ==================== CANCEL ====================

export const getCancelKeyboard = (): InlineKeyboard => {
    return new InlineKeyboard().text(`${EMOJI.CROSS} Bekor qilish`, 'admin_back');
};

// ==================== REFERRAL LINK ====================

export const getReferralKeyboard = (referralLink: string): InlineKeyboard => {
    return new InlineKeyboard()
        .url(
            `${EMOJI.LINK} Do'stlarga ulashish`,
            `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Konkursda qatnashing va sovg'alar yuting! 🎁")}`,
        )
        .row()
        .text(`${EMOJI.BACK} Orqaga`, 'back_to_menu');
};
