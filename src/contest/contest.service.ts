import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Contest } from '@prisma/client';

@Injectable()
export class ContestService {
    private readonly logger = new Logger(ContestService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Faol konkursni olish (bitta vaqtda faqat bitta)
     */
    async getActiveContest(): Promise<Contest | null> {
        return this.prisma.contest.findFirst({
            where: {
                isActive: true,
                endDate: { gte: new Date() },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Konkurs yaratish
     */
    async create(data: {
        title: string;
        description: string;
        prizes: string;
        imageUrl?: string;
        endDate: Date;
    }): Promise<Contest> {
        // Avvalgi faol konkursni o'chirish
        await this.prisma.contest.updateMany({
            where: { isActive: true },
            data: { isActive: false },
        });

        const contest = await this.prisma.contest.create({
            data: {
                title: data.title,
                description: data.description,
                prizes: data.prizes,
                imageUrl: data.imageUrl,
                endDate: data.endDate,
                isActive: true,
            },
        });

        this.logger.log(`Yangi konkurs yaratildi: ${contest.title}`);
        return contest;
    }

    /**
     * Konkursni yangilash
     */
    async update(
        id: number,
        data: Partial<{
            title: string;
            description: string;
            prizes: string;
            imageUrl: string;
            endDate: Date;
            isActive: boolean;
        }>,
    ): Promise<Contest> {
        return this.prisma.contest.update({
            where: { id },
            data,
        });
    }

    /**
     * Konkursni to'xtatish
     */
    async deactivate(id: number): Promise<Contest> {
        return this.prisma.contest.update({
            where: { id },
            data: { isActive: false },
        });
    }

    /**
     * ID orqali konkursni olish
     */
    async findById(id: number): Promise<Contest | null> {
        return this.prisma.contest.findUnique({
            where: { id },
        });
    }

    /**
     * Barcha konkurslar (tarix)
     */
    async getAll(): Promise<Contest[]> {
        return this.prisma.contest.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Konkurs tugash vaqtigacha qolgan vaqt
     */
    getTimeRemaining(endDate: Date): string {
        const now = new Date();
        const diff = endDate.getTime() - now.getTime();

        if (diff <= 0) {
            return 'Tugagan';
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        const parts: string[] = [];
        if (days > 0) parts.push(`${days} kun`);
        if (hours > 0) parts.push(`${hours} soat`);
        if (minutes > 0 && days === 0) parts.push(`${minutes} daqiqa`);

        return parts.join(' ') || '1 daqiqadan kam';
    }

    /**
     * Konkurs sanasini formatlash
     */
    formatDate(date: Date): string {
        return date.toLocaleDateString('uz-UZ', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
}
