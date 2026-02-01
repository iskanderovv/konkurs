import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';
import { customAlphabet } from 'nanoid';

// Referral kod generatori (8 ta belgi, faqat katta harflar va raqamlar)
const generateReferralCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

@Injectable()
export class UserService {
    private readonly logger = new Logger(UserService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Telegram ID orqali foydalanuvchini topish
     */
    async findByTelegramId(telegramId: number | bigint): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { telegramId: BigInt(telegramId) },
        });
    }

    /**
     * Referral kod orqali foydalanuvchini topish
     */
    async findByReferralCode(referralCode: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { referralCode },
        });
    }

    /**
     * Yangi foydalanuvchi yaratish
     */
    async create(data: {
        telegramId: number | bigint;
        username?: string;
        firstName: string;
        lastName?: string;
        phone: string;
        referredById?: number;
    }): Promise<User> {
        const referralCode = generateReferralCode();

        const user = await this.prisma.user.create({
            data: {
                telegramId: BigInt(data.telegramId),
                username: data.username,
                firstName: data.firstName,
                lastName: data.lastName,
                phone: data.phone,
                referralCode,
                referredById: data.referredById,
                isParticipant: true,
            },
        });

        this.logger.log(`Yangi foydalanuvchi: ${user.firstName} (${user.telegramId})`);
        return user;
    }

    /**
     * Foydalanuvchiga ball qo'shish
     */
    async addPoints(
        userId: number,
        amount: number,
        reason: string,
        referralId?: number,
        note?: string,
    ): Promise<User> {
        // Transaction: ball qo'shish va tarix yozish
        const [user] = await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: userId },
                data: { points: { increment: amount } },
            }),
            this.prisma.pointHistory.create({
                data: {
                    userId,
                    amount,
                    reason,
                    referralId,
                    note,
                },
            }),
        ]);

        return user;
    }

    /**
     * Referral orqali ball qo'shish
     */
    async processReferral(referrerId: number, newUserId: number, pointsPerReferral: number): Promise<void> {
        await this.addPoints(
            referrerId,
            pointsPerReferral,
            'referral',
            newUserId,
            'Yangi do\'st taklif qildi',
        );
        this.logger.log(`Referral ball: User #${referrerId} ga +${pointsPerReferral} ball`);
    }

    /**
     * Bonus ball berish
     */
    async addBonus(userId: number, amount: number, type: 'subscription' | 'other'): Promise<void> {
        if (type === 'subscription') {
            await this.prisma.user.update({
                where: { id: userId },
                data: { hasReceivedSubscriptionBonus: true },
            });
        }

        await this.addPoints(
            userId,
            amount,
            'bonus',
            undefined,
            type === 'subscription' ? 'Kanal obunasi uchun bonus' : 'Boshqa bonus',
        );
        this.logger.log(`Bonus ball: User #${userId} ga +${amount} ball (${type})`);
    }

    /**
     * Foydalanuvchi ball tarixi
     */
    async getPointHistory(userId: number, limit: number = 10) {
        return this.prisma.pointHistory.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /**
     * Foydalanuvchi taklif qilganlar ro'yxati
     */
    async getReferrals(userId: number) {
        return this.prisma.user.findMany({
            where: { referredById: userId },
            select: {
                id: true,
                username: true,
                firstName: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Foydalanuvchi taklif qilganlar soni
     */
    async getReferralCount(userId: number): Promise<number> {
        return this.prisma.user.count({
            where: { referredById: userId },
        });
    }

    /**
     * Top foydalanuvchilar (reyting)
     */
    async getTopUsers(limit: number = 10): Promise<User[]> {
        return this.prisma.user.findMany({
            where: {
                isParticipant: true,
                isBanned: false,
            },
            orderBy: { points: 'desc' },
            take: limit,
        });
    }

    /**
     * Foydalanuvchi o'rni
     */
    async getUserRank(userId: number): Promise<number> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { points: true },
        });

        if (!user) return 0;

        const rank = await this.prisma.user.count({
            where: {
                isParticipant: true,
                isBanned: false,
                points: { gt: user.points },
            },
        });

        return rank + 1;
    }

    /**
     * Jami ishtirokchilar soni
     */
    async getParticipantCount(): Promise<number> {
        return this.prisma.user.count({
            where: {
                isParticipant: true,
                isBanned: false,
            },
        });
    }

    /**
     * Foydalanuvchini bloklash
     */
    async banUser(userId: number, reason?: string): Promise<User> {
        return this.prisma.user.update({
            where: { id: userId },
            data: {
                isBanned: true,
                banReason: reason,
                points: 0, // Ballarni nolga tushirish
            },
        });
    }

    /**
     * Foydalanuvchini blokdan chiqarish
     */
    async unbanUser(userId: number): Promise<User> {
        return this.prisma.user.update({
            where: { id: userId },
            data: {
                isBanned: false,
                banReason: null,
            },
        });
    }

    /**
     * Barcha ishtirokchilar (pagination)
     */
    async getAllParticipants(page: number = 1, limit: number = 50) {
        const skip = (page - 1) * limit;

        const [users, total] = await this.prisma.$transaction([
            this.prisma.user.findMany({
                where: { isParticipant: true },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.user.count({
                where: { isParticipant: true },
            }),
        ]);

        return { users, total, page, limit };
    }
}
