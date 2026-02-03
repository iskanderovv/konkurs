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
                const chatMember = await bot.api.getChatMember(channel.channelId, userId);

                // member, administrator, creator - obuna bo'lgan
                // left, kicked - obuna bo'lmagan
                if (['left', 'kicked'].includes(chatMember.status)) {
                    unsubscribedChannels.push(channel);
                }
            } catch (error) {
                // Xatolik bo'lsa (bot admin emas yoki kanal topilmasa)
                this.logger.warn(`Kanal tekshirishda xatolik: ${channel.channelId}`, error);
                // Xatolik bo'lsa ham kanalga obuna bo'lmagan deb hisoblaymiz
                unsubscribedChannels.push(channel);
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

            let inviteLink: string | undefined;

            // Agar kanal chat ID bilan qo'shilgan bo'lsa, invite link olish
            if (channelId.startsWith('-100') || channelId.startsWith('-')) {
                try {
                    // Mavjud invite linkni olishga harakat qilish
                    if ('invite_link' in chat && chat.invite_link) {
                        inviteLink = chat.invite_link;
                    } else {
                        // Yangi invite link yaratish
                        const link = await bot.api.createChatInviteLink(channelId);
                        inviteLink = link.invite_link;
                    }
                } catch (linkError) {
                    this.logger.warn(`Invite link olishda xatolik: ${channelId}`, linkError);
                }
            }

            return {
                title: 'title' in chat ? chat.title || 'Noma\'lum' : 'Noma\'lum',
                isPrivate: chat.type === 'supergroup' || chat.type === 'channel',
                inviteLink,
            };
        } catch (error) {
            this.logger.error(`Kanal ma'lumotlarini olishda xatolik: ${channelId}`, error);
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
