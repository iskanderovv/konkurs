import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Channel } from '@prisma/client';
import { Bot } from 'grammy';

@Injectable()
export class ChannelService {
    private readonly logger = new Logger(ChannelService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Barcha faol kanallarni olish
     */
    async getActiveChannels(): Promise<Channel[]> {
        return this.prisma.channel.findMany({
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
        });
    }

    /**
     * Barcha kanallarni olish
     */
    async getAllChannels(): Promise<Channel[]> {
        return this.prisma.channel.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Kanal qo'shish
     */
    async addChannel(data: {
        channelId: string;
        title: string;
        isPrivate?: boolean;
        inviteLink?: string;
    }): Promise<Channel> {
        const channel = await this.prisma.channel.create({
            data: {
                channelId: data.channelId,
                title: data.title,
                isPrivate: data.isPrivate || false,
                inviteLink: data.inviteLink,
            },
        });

        this.logger.log(`Kanal qo'shildi: ${channel.title} (${channel.channelId})`);
        return channel;
    }

    /**
     * Kanalni o'chirish
     */
    async removeChannel(id: number): Promise<void> {
        await this.prisma.channel.delete({
            where: { id },
        });
        this.logger.log(`Kanal o'chirildi: #${id}`);
    }

    /**
     * Kanalni faollashtirish/o'chirish
     */
    async toggleChannel(id: number): Promise<Channel> {
        const channel = await this.prisma.channel.findUnique({
            where: { id },
        });

        if (!channel) {
            throw new Error('Kanal topilmadi');
        }

        return this.prisma.channel.update({
            where: { id },
            data: { isActive: !channel.isActive },
        });
    }

    /**
     * Foydalanuvchi kanallarga obuna bo'lganligini tekshirish
     */
    async checkUserSubscription(
        bot: Bot,
        userId: number,
    ): Promise<{ allSubscribed: boolean; unsubscribedChannels: Channel[] }> {
        const channels = await this.getActiveChannels();
        const unsubscribedChannels: Channel[] = [];

        for (const channel of channels) {
            try {
                this.logger.debug(`Tekshirilmoqda: ${channel.title} (${channel.channelId}), userId: ${userId}`);
                const chatMember = await bot.api.getChatMember(channel.channelId, userId);
                this.logger.debug(`Status: ${chatMember.status}`);

                // member, administrator, creator - obuna bo'lgan
                // left, kicked - obuna bo'lmagan
                if (['left', 'kicked'].includes(chatMember.status)) {
                    unsubscribedChannels.push(channel);
                }
            } catch (error: any) {
                // Bot admin emas yoki kanal topilmasa
                const errorMsg = error?.message || error?.description || String(error);
                this.logger.warn(`Kanal tekshirishda xatolik: ${channel.channelId} - ${errorMsg}`);

                // "user not found" xatosi - foydalanuvchi kanalda yo'q
                // "chat not found" - kanal topilmadi (bot admin emas)
                // "bot is not a member" - bot kanalda emas
                if (errorMsg.includes('user not found') ||
                    errorMsg.includes('USER_NOT_PARTICIPANT') ||
                    errorMsg.includes('CHAT_ADMIN_REQUIRED')) {
                    unsubscribedChannels.push(channel);
                } else if (errorMsg.includes('chat not found') ||
                    errorMsg.includes('bot is not a member') ||
                    errorMsg.includes('CHANNEL_PRIVATE')) {
                    // Bot kanalda admin emas - bu kanalga obuna bo'lmagan deb hisoblanmasin
                    // chunki bot sozlamalarida xatolik bor
                    this.logger.error(`Bot kanal adminligini tekshiring: ${channel.title} (${channel.channelId})`);
                    // Bu holatda kanalga obuna talab qilmaymiz (bot muammosi)
                } else {
                    // Boshqa xatoliklar uchun obuna bo'lmagan deb hisoblaymiz
                    unsubscribedChannels.push(channel);
                }
            }
        }

        return {
            allSubscribed: unsubscribedChannels.length === 0,
            unsubscribedChannels,
        };
    }

    /**
     * Kanal ma'lumotlarini Telegram API orqali olish
     */
    async getChannelInfo(bot: Bot, channelId: string): Promise<{ title: string; isPrivate: boolean; inviteLink?: string } | null> {
        try {
            const chat = await bot.api.getChat(channelId);
            this.logger.debug(`Kanal ma'lumotlari: ${JSON.stringify(chat)}`);

            let inviteLink: string | undefined;
            // isPrivate: agar kanal username yo'q bo'lsa, bu private kanal
            // @username bilan ochiq kanallar uchun username mavjud bo'ladi
            const isPrivate = !('username' in chat && chat.username);

            // Agar kanal chat ID bilan qo'shilgan bo'lsa yoki private bo'lsa, invite link olish
            if (channelId.startsWith('-100') || channelId.startsWith('-') || isPrivate) {
                try {
                    // Mavjud invite linkni olishga harakat qilish
                    if ('invite_link' in chat && chat.invite_link) {
                        inviteLink = chat.invite_link;
                        this.logger.debug(`Mavjud invite link topildi: ${inviteLink}`);
                    } else {
                        // Yangi invite link yaratish
                        const link = await bot.api.createChatInviteLink(channelId);
                        inviteLink = link.invite_link;
                        this.logger.debug(`Yangi invite link yaratildi: ${inviteLink}`);
                    }
                } catch (linkError: any) {
                    this.logger.warn(`Invite link olishda xatolik: ${channelId} - ${linkError?.message || linkError}`);
                }
            } else {
                // Ochiq kanal uchun @username asosida link yaratish
                const username = 'username' in chat ? chat.username : null;
                if (username) {
                    inviteLink = `https://t.me/${username}`;
                    this.logger.debug(`Username orqali invite link: ${inviteLink}`);
                }
            }

            return {
                title: 'title' in chat ? chat.title || 'Noma\'lum' : 'Noma\'lum',
                isPrivate,
                inviteLink,
            };
        } catch (error: any) {
            this.logger.error(`Kanal ma'lumotlarini olishda xatolik: ${channelId} - ${error?.message || error}`);
            return null;
        }
    }

    /**
     * Kanal ID orqali topish
     */
    async findByChannelId(channelId: string): Promise<Channel | null> {
        return this.prisma.channel.findUnique({
            where: { channelId },
        });
    }
}
