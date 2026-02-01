import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, session, GrammyError, HttpError, InlineKeyboard } from 'grammy';
import { hydrate } from '@grammyjs/hydrate';
import { hydrateReply, parseMode } from '@grammyjs/parse-mode';
import { run, RunnerHandle } from '@grammyjs/runner';

import { BotContext, SessionData } from './types';
import { UserService } from '../user/user.service';
import { ContestService } from '../contest/contest.service';
import { ChannelService } from '../channel/channel.service';
import { PrismaService } from '../prisma/prisma.service';
import { EMOJI, MESSAGES } from './constants';
import {
    getMainMenuKeyboard,
    getPhoneKeyboard,
    getChannelsKeyboard,
    getAdminMenuKeyboard,
    getAdminContestKeyboard,
    getAdminChannelsKeyboard,
    getCancelKeyboard,
    getReferralKeyboard,
} from './keyboards';

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(BotService.name);
    public bot: Bot<BotContext>;
    private runner: RunnerHandle | null = null;
    private adminIds: number[] = [];
    private pointsPerReferral: number = 5;

    constructor(
        private configService: ConfigService,
        private userService: UserService,
        private contestService: ContestService,
        private channelService: ChannelService,
        private prisma: PrismaService,
    ) {
        const token = this.configService.get<string>('bot.token');
        if (!token) {
            throw new Error("BOT_TOKEN muhit o'zgaruvchisi topilmadi!");
        }

        this.bot = new Bot<BotContext>(token);
        this.adminIds = this.configService.get<number[]>('bot.adminIds') || [];
        this.pointsPerReferral = this.configService.get<number>('points.perReferral') || 5;
    }

    async onModuleInit() {
        this.setupMiddlewares();
        this.setupHandlers();
        await this.startBot();
    }

    async onModuleDestroy() {
        if (this.runner) {
            this.runner.stop();
            this.logger.log("Bot to'xtatildi");
        }
    }

    private setupMiddlewares() {
        // Session
        this.bot.use(
            session({
                initial: (): SessionData => ({}),
            }),
        );

        // Hydrate va Parse Mode
        this.bot.use(hydrate());
        this.bot.use(hydrateReply);
        this.bot.api.config.use(parseMode('HTML'));

        // Error handling
        this.bot.catch((err) => {
            this.logger.error(`Xatolik: ${err.message}`, err.error);

            if (err.error instanceof GrammyError) {
                this.logger.error(`Telegram API xatosi: ${err.error.description}`);
            } else if (err.error instanceof HttpError) {
                this.logger.error(`Tarmoq xatosi: ${err.error}`);
            }
        });
    }

    private setupHandlers() {
        // ==================== START COMMAND ====================
        this.bot.command('start', async (ctx) => {
            const telegramId = ctx.from?.id;
            if (!telegramId) return;

            // Bloklangan foydalanuvchini tekshirish
            const existingUser = await this.userService.findByTelegramId(telegramId);
            if (existingUser?.isBanned) {
                return ctx.reply(MESSAGES.BANNED);
            }

            // Referral kod (agar bor bo'lsa)
            const startPayload = ctx.match;
            if (startPayload && typeof startPayload === 'string') {
                ctx.session.referralCode = startPayload;
            }

            // Agar foydalanuvchi allaqachon ro'yxatdan o'tgan bo'lsa
            if (existingUser?.isParticipant) {
                return ctx.reply(MESSAGES.WELCOME_BACK, {
                    reply_markup: getMainMenuKeyboard(),
                });
            }

            // Yangi foydalanuvchi - telefon so'rash
            ctx.session.registrationStep = 'phone';
            return ctx.reply(MESSAGES.SEND_PHONE, {
                reply_markup: getPhoneKeyboard(),
            });
        });

        // ==================== PHONE CONTACT ====================
        this.bot.on('message:contact', async (ctx) => {
            if (ctx.session.registrationStep !== 'phone') return;

            const contact = ctx.message.contact;
            const telegramId = ctx.from?.id;

            if (!telegramId || !contact.phone_number) {
                return ctx.reply(MESSAGES.INVALID_PHONE);
            }

            // Foydalanuvchi o'z raqamini yuborayotganini tekshirish
            if (contact.user_id !== telegramId) {
                return ctx.reply(MESSAGES.INVALID_PHONE);
            }

            // Foydalanuvchini yaratish
            let referrerId: number | undefined;
            if (ctx.session.referralCode) {
                const referrer = await this.userService.findByReferralCode(ctx.session.referralCode);
                if (referrer && referrer.telegramId !== BigInt(telegramId)) {
                    referrerId = referrer.id;
                }
            }

            const user = await this.userService.create({
                telegramId,
                username: ctx.from?.username,
                firstName: ctx.from?.first_name || "Noma'lum",
                lastName: ctx.from?.last_name,
                phone: contact.phone_number,
                referredById: referrerId,
            });

            // Referral ball qo'shish
            if (referrerId) {
                await this.userService.processReferral(referrerId, user.id, this.pointsPerReferral);
            }

            await ctx.reply(MESSAGES.PHONE_RECEIVED);

            // Kanallarni tekshirish
            ctx.session.registrationStep = 'subscribe';
            await this.showChannels(ctx);
        });

        // ==================== CHECK SUBSCRIPTION ====================
        this.bot.callbackQuery('check_subscription', async (ctx) => {
            await ctx.answerCallbackQuery();

            const telegramId = ctx.from?.id;
            if (!telegramId) return;

            const result = await this.channelService.checkUserSubscription(this.bot, telegramId);

            if (result.allSubscribed) {
                // Foydalanuvchini tekshirish va bonus ball berish
                const user = await this.userService.findByTelegramId(telegramId);

                if (user && !user.hasReceivedSubscriptionBonus) {
                    // 5 ball sovg'a qilish
                    await this.userService.addBonus(user.id, this.pointsPerReferral, 'subscription');
                    await ctx.editMessageText(
                        `${EMOJI.CHECK} <b>Barcha kanallarga obuna bo'ldingiz!</b>\n\n` +
                        `🎁 Sizga <b>+${this.pointsPerReferral}</b> ball sovg'a qilindi!`,
                        { parse_mode: 'HTML' }
                    );
                } else {
                    await ctx.editMessageText(MESSAGES.ALL_SUBSCRIBED, { parse_mode: 'HTML' });
                }

                // Main menu ko'rsatish
                await ctx.reply(MESSAGES.WELCOME_BACK, {
                    reply_markup: getMainMenuKeyboard(),
                });

                ctx.session.registrationStep = undefined;
            } else {
                await ctx.editMessageText(
                    `${MESSAGES.NOT_SUBSCRIBED}\n\n` +
                    result.unsubscribedChannels.map((ch, i) => `${i + 1}. ${ch.title}`).join('\n'),
                    {
                        reply_markup: getChannelsKeyboard(result.unsubscribedChannels),
                        parse_mode: 'HTML',
                    },
                );
            }
        });

        // ==================== MENU HANDLERS (kanal obuna tekshirish bilan) ====================
        this.bot.hears(`${EMOJI.CONTEST} Konkursda qatnashish`, (ctx) => this.withSubscriptionCheck(ctx, () => this.showContest(ctx)));
        this.bot.hears(`${EMOJI.GIFT} Sovg'alar`, (ctx) => this.withSubscriptionCheck(ctx, () => this.showPrizes(ctx)));
        this.bot.hears(`${EMOJI.POINTS} Ballarim`, (ctx) => this.withSubscriptionCheck(ctx, () => this.showPoints(ctx)));
        this.bot.hears(`${EMOJI.RATING} Reyting`, (ctx) => this.withSubscriptionCheck(ctx, () => this.showRating(ctx)));
        this.bot.hears(`${EMOJI.TERMS} Shartlar`, (ctx) => this.withSubscriptionCheck(ctx, () => this.showTerms(ctx)));
        this.bot.hears(`${EMOJI.CONTACT} Aloqa`, (ctx) => this.withSubscriptionCheck(ctx, () => this.showContact(ctx)));

        // ==================== BACK TO MENU ====================
        this.bot.callbackQuery('back_to_menu', async (ctx) => {
            await ctx.answerCallbackQuery();
            await ctx.deleteMessage().catch(() => { });
        });

        // ==================== ADMIN COMMAND ====================
        this.bot.command('admin', async (ctx) => {
            const telegramId = ctx.from?.id;
            if (!telegramId || !this.isAdmin(telegramId)) {
                return ctx.reply(MESSAGES.NOT_ADMIN);
            }

            return ctx.reply(MESSAGES.ADMIN_WELCOME, {
                reply_markup: getAdminMenuKeyboard(),
            });
        });

        // Admin callback handlers
        this.setupAdminHandlers();
    }

    private setupAdminHandlers() {
        // Admin back
        this.bot.callbackQuery('admin_back', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = undefined;
            ctx.session.broadcastContent = undefined;
            ctx.session.broadcastMedia = undefined;
            await ctx.editMessageText(MESSAGES.ADMIN_WELCOME, {
                reply_markup: getAdminMenuKeyboard(),
                parse_mode: 'HTML',
            });
        });

        // Stats
        this.bot.callbackQuery('admin_stats', async (ctx) => {
            await ctx.answerCallbackQuery();

            const [totalUsers, channels, activeContest] = await Promise.all([
                this.userService.getParticipantCount(),
                this.channelService.getAllChannels(),
                this.contestService.getActiveContest(),
            ]);

            const totalPoints = await this.prisma.user.aggregate({
                _sum: { points: true },
                where: { isParticipant: true },
            });

            await ctx.editMessageText(
                MESSAGES.ADMIN_STATS(totalUsers, totalPoints._sum.points || 0, channels.length, !!activeContest),
                {
                    reply_markup: getAdminMenuKeyboard(),
                    parse_mode: 'HTML',
                },
            );
        });

        // ==================== USERS ====================
        this.bot.callbackQuery('admin_users', async (ctx) => {
            await ctx.answerCallbackQuery();
            await this.showAdminUsers(ctx, 1);
        });

        this.bot.callbackQuery(/^users_page_(\d+)$/, async (ctx) => {
            await ctx.answerCallbackQuery();
            const page = parseInt(ctx.match[1]);
            await this.showAdminUsers(ctx, page);
        });

        this.bot.callbackQuery(/^view_user_(\d+)$/, async (ctx) => {
            await ctx.answerCallbackQuery();
            const userId = parseInt(ctx.match[1]);
            await this.showUserDetails(ctx, userId);
        });

        this.bot.callbackQuery(/^ban_user_(\d+)$/, async (ctx) => {
            await ctx.answerCallbackQuery('Foydalanuvchi bloklandi');
            const userId = parseInt(ctx.match[1]);
            await this.userService.banUser(userId, 'Admin tomonidan bloklangan');
            await this.showUserDetails(ctx, userId);
        });

        this.bot.callbackQuery(/^unban_user_(\d+)$/, async (ctx) => {
            await ctx.answerCallbackQuery('Foydalanuvchi blokdan chiqarildi');
            const userId = parseInt(ctx.match[1]);
            await this.userService.unbanUser(userId);
            await this.showUserDetails(ctx, userId);
        });

        // ==================== CHANNELS ====================
        this.bot.callbackQuery('admin_channels', async (ctx) => {
            await ctx.answerCallbackQuery();
            await this.showAdminChannels(ctx);
        });

        this.bot.callbackQuery(/^toggle_channel_(\d+)$/, async (ctx) => {
            await ctx.answerCallbackQuery();
            const channelId = parseInt(ctx.match[1]);
            await this.channelService.toggleChannel(channelId);
            await this.showAdminChannels(ctx);
        });

        this.bot.callbackQuery(/^delete_channel_(\d+)$/, async (ctx) => {
            await ctx.answerCallbackQuery('Kanal o\'chirildi');
            const channelId = parseInt(ctx.match[1]);
            await this.channelService.removeChannel(channelId);
            await this.showAdminChannels(ctx);
        });

        this.bot.callbackQuery('add_channel', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = 'add_channel';
            await ctx.editMessageText(MESSAGES.CHANNEL_ADD, {
                reply_markup: getCancelKeyboard(),
                parse_mode: 'HTML',
            });
        });

        // ==================== CONTEST ====================
        this.bot.callbackQuery('admin_contest', async (ctx) => {
            await ctx.answerCallbackQuery();
            await this.showAdminContest(ctx);
        });

        this.bot.callbackQuery('contest_create', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = 'contest_title';
            ctx.session.newContest = {};
            await ctx.editMessageText(MESSAGES.CONTEST_ENTER_TITLE, {
                reply_markup: getCancelKeyboard(),
                parse_mode: 'HTML',
            });
        });

        this.bot.callbackQuery('contest_edit', async (ctx) => {
            await ctx.answerCallbackQuery();
            await this.showContestEditMenu(ctx);
        });

        this.bot.callbackQuery('contest_edit_title', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = 'edit_contest_title';
            await ctx.editMessageText('📝 Yangi konkurs nomini kiriting:', {
                reply_markup: getCancelKeyboard(),
                parse_mode: 'HTML',
            });
        });

        this.bot.callbackQuery('contest_edit_desc', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = 'edit_contest_description';
            await ctx.editMessageText('📝 Yangi tavsifni kiriting:', {
                reply_markup: getCancelKeyboard(),
                parse_mode: 'HTML',
            });
        });

        this.bot.callbackQuery('contest_edit_prizes', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = 'edit_contest_prizes';
            await ctx.editMessageText('🎁 Yangi sovrinlar ro\'yxatini kiriting:', {
                reply_markup: getCancelKeyboard(),
                parse_mode: 'HTML',
            });
        });

        this.bot.callbackQuery('contest_edit_date', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = 'edit_contest_date';
            await ctx.editMessageText('📅 Yangi tugash sanasini kiriting (YYYY-MM-DD HH:MM):', {
                reply_markup: getCancelKeyboard(),
                parse_mode: 'HTML',
            });
        });

        this.bot.callbackQuery('contest_edit_image', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = 'edit_contest_image';
            await ctx.editMessageText('🖼 Konkurs uchun yangi rasm yuboring:', {
                reply_markup: getCancelKeyboard(),
                parse_mode: 'HTML',
            });
        });

        this.bot.callbackQuery('contest_stop', async (ctx) => {
            await ctx.answerCallbackQuery();
            const contest = await this.contestService.getActiveContest();
            if (contest) {
                await this.contestService.deactivate(contest.id);
                await ctx.editMessageText(`${EMOJI.CHECK} Konkurs to'xtatildi.`, {
                    reply_markup: getAdminMenuKeyboard(),
                    parse_mode: 'HTML',
                });
            }
        });

        this.bot.callbackQuery('contest_results', async (ctx) => {
            await ctx.answerCallbackQuery();
            await this.showContestResults(ctx);
        });

        // ==================== SHARTLAR (TERMS) ====================
        this.bot.callbackQuery('admin_terms', async (ctx) => {
            await ctx.answerCallbackQuery();
            await this.showAdminTerms(ctx);
        });

        this.bot.callbackQuery('edit_terms', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = 'edit_terms';
            await ctx.editMessageText("📋 Yangi shartlar matnini kiriting (HTML qo'llab-quvvatlanadi):", {
                reply_markup: getCancelKeyboard(),
                parse_mode: 'HTML',
            });
        });

        // ==================== ALOQA (CONTACT) ====================
        this.bot.callbackQuery('admin_contact', async (ctx) => {
            await ctx.answerCallbackQuery();
            await this.showAdminContact(ctx);
        });

        this.bot.callbackQuery('edit_contact', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = 'edit_contact';
            await ctx.editMessageText(
                `${EMOJI.CONTACT} <b>Aloqa matnini kiriting</b>\n\n` +
                `HTML qo'llab-quvvatlanadi. Masalan:\n\n` +
                `<code>Savollar uchun:\n👤 Admin: @username\n📢 Kanal: @kanal</code>`,
                {
                    reply_markup: getCancelKeyboard(),
                    parse_mode: 'HTML',
                },
            );
        });

        // ==================== BROADCAST (SODDA) ====================
        this.bot.callbackQuery('admin_broadcast', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = 'broadcast';
            ctx.session.broadcastButtons = [];
            ctx.session.broadcastContent = undefined;
            ctx.session.broadcastMedia = undefined;
            ctx.session.broadcastType = undefined;

            const count = await this.userService.getParticipantCount();

            await ctx.editMessageText(
                `${EMOJI.MESSAGE} <b>Xabar yuborish</b>\n\n` +
                `👥 Foydalanuvchilar: <b>${count}</b> ta\n\n` +
                `Xabaringizni yuboring:`,
                {
                    reply_markup: getCancelKeyboard(),
                    parse_mode: 'HTML',
                },
            );
        });

        this.bot.callbackQuery('broadcast_add_button', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = 'broadcast_button_name';
            await ctx.editMessageText('🔘 Tugma nomini kiriting:', {
                reply_markup: getCancelKeyboard(),
                parse_mode: 'HTML',
            });
        });

        this.bot.callbackQuery('broadcast_remove_buttons', async (ctx) => {
            await ctx.answerCallbackQuery('Tugmalar o\'chirildi');
            ctx.session.broadcastButtons = [];
            await this.showBroadcastPreview(ctx);
        });

        this.bot.callbackQuery('broadcast_confirm', async (ctx) => {
            await ctx.answerCallbackQuery();
            await this.executeBroadcast(ctx);
        });

        this.bot.callbackQuery('broadcast_cancel', async (ctx) => {
            await ctx.answerCallbackQuery();
            ctx.session.adminStep = undefined;
            ctx.session.broadcastContent = undefined;
            ctx.session.broadcastMedia = undefined;
            ctx.session.broadcastButtons = undefined;
            await ctx.editMessageText(MESSAGES.ADMIN_WELCOME, {
                reply_markup: getAdminMenuKeyboard(),
                parse_mode: 'HTML',
            });
        });

        // ==================== TEXT MESSAGE HANDLERS ====================
        this.bot.on('message:text', async (ctx, next) => {
            const telegramId = ctx.from?.id;
            if (!telegramId || !this.isAdmin(telegramId)) {
                return next();
            }

            const { adminStep } = ctx.session;
            if (!adminStep) return next();

            const text = ctx.message.text;

            switch (adminStep) {
                case 'add_channel':
                    await this.handleAddChannel(ctx, text);
                    break;
                case 'contest_title':
                    ctx.session.newContest!.title = text;
                    ctx.session.adminStep = 'contest_description';
                    await ctx.reply(MESSAGES.CONTEST_ENTER_DESC, { reply_markup: getCancelKeyboard() });
                    break;
                case 'contest_description':
                    ctx.session.newContest!.description = text;
                    ctx.session.adminStep = 'contest_prizes';
                    await ctx.reply(MESSAGES.CONTEST_ENTER_PRIZES, { reply_markup: getCancelKeyboard() });
                    break;
                case 'contest_prizes':
                    ctx.session.newContest!.prizes = text;
                    ctx.session.adminStep = 'contest_image';
                    await ctx.reply('🖼 Konkurs uchun rasm yuboring (yoki /skip bosing):', { reply_markup: getCancelKeyboard() });
                    break;
                case 'contest_date':
                    await this.handleContestDate(ctx, text);
                    break;
                case 'edit_contest_title':
                case 'edit_contest_description':
                case 'edit_contest_prizes':
                case 'edit_contest_date':
                    await this.handleContestEdit(ctx, adminStep, text);
                    break;
                case 'edit_terms':
                    await this.handleTermsEdit(ctx, text);
                    break;
                case 'broadcast':
                    ctx.session.broadcastContent = text;
                    ctx.session.broadcastType = 'text';
                    await this.showBroadcastPreview(ctx);
                    break;
                case 'broadcast_button_name':
                    ctx.session.tempButtonName = text;
                    ctx.session.adminStep = 'broadcast_button_url';
                    await ctx.reply('🔗 Tugma havolasini kiriting:', { reply_markup: getCancelKeyboard() });
                    break;
                case 'broadcast_button_url':
                    if (!ctx.session.broadcastButtons) ctx.session.broadcastButtons = [];
                    ctx.session.broadcastButtons.push({
                        text: ctx.session.tempButtonName || 'Tugma',
                        url: text,
                    });
                    ctx.session.tempButtonName = undefined;
                    ctx.session.adminStep = 'broadcast';
                    await this.showBroadcastPreview(ctx);
                    break;
                case 'edit_contact':
                    await this.handleContactEdit(ctx, text);
                    break;
                default:
                    return next();
            }
        });

        // ==================== PHOTO/VIDEO HANDLERS ====================
        this.bot.on('message:photo', async (ctx, next) => {
            const telegramId = ctx.from?.id;
            if (!telegramId || !this.isAdmin(telegramId)) return next();

            const { adminStep } = ctx.session;
            const photo = ctx.message.photo[ctx.message.photo.length - 1];

            if (adminStep === 'broadcast') {
                ctx.session.broadcastMedia = photo.file_id;
                ctx.session.broadcastType = 'photo';
                ctx.session.broadcastContent = ctx.message.caption || '';
                await this.showBroadcastPreview(ctx);
            } else if (adminStep === 'contest_image') {
                ctx.session.newContest!.imageUrl = photo.file_id;
                ctx.session.adminStep = 'contest_date';
                await ctx.reply(`${EMOJI.CHECK} Rasm saqlandi!\n\n${MESSAGES.CONTEST_ENTER_DATE}`, { reply_markup: getCancelKeyboard() });
            } else if (adminStep === 'edit_contest_image') {
                await this.handleContestImageEdit(ctx, photo.file_id);
            } else {
                return next();
            }
        });

        this.bot.on('message:video', async (ctx, next) => {
            const telegramId = ctx.from?.id;
            if (!telegramId || !this.isAdmin(telegramId)) return next();
            if (ctx.session.adminStep !== 'broadcast') return next();

            ctx.session.broadcastMedia = ctx.message.video.file_id;
            ctx.session.broadcastType = 'video';
            ctx.session.broadcastContent = ctx.message.caption || '';
            await this.showBroadcastPreview(ctx);
        });

        // Skip command for optional image
        this.bot.command('skip', async (ctx) => {
            const telegramId = ctx.from?.id;
            if (!telegramId || !this.isAdmin(telegramId)) return;

            if (ctx.session.adminStep === 'contest_image') {
                ctx.session.adminStep = 'contest_date';
                await ctx.reply(MESSAGES.CONTEST_ENTER_DATE, { reply_markup: getCancelKeyboard() });
            }
        });
    }

    // ==================== ADMIN HELPER METHODS ====================

    private async showAdminUsers(ctx: BotContext, page: number) {
        const limit = 15;
        const result = await this.userService.getAllParticipants(page, limit);
        const { users, total } = result;
        const totalPages = Math.ceil(total / limit);

        let text = `${EMOJI.USERS} <b>Foydalanuvchilar</b> (${total} ta)\n`;
        text += `📄 Sahifa: ${page}/${totalPages}\n\n`;

        if (users.length === 0) {
            text += "Hozircha foydalanuvchilar yo'q.";
        } else {
            users.forEach((u, i) => {
                const num = (page - 1) * limit + i + 1;
                const username = u.username ? `@${u.username}` : u.firstName;
                const status = u.isBanned ? '🚫' : '✅';
                text += `${num}. ${status} ${username} — <b>${u.points}</b> ball\n`;
            });
        }

        const keyboard = new InlineKeyboard();

        // Faqat pagination
        if (totalPages > 1) {
            if (page > 1) keyboard.text('◀️ Oldingi', `users_page_${page - 1}`);
            if (page < totalPages) keyboard.text('Keyingi ▶️', `users_page_${page + 1}`);
            keyboard.row();
        }

        keyboard.text(`${EMOJI.BACK} Orqaga`, 'admin_back');

        await ctx.editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
    }

    private async showUserDetails(ctx: BotContext, userId: number) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { referrals: { select: { id: true } } },
        });

        if (!user) {
            return ctx.answerCallbackQuery("Foydalanuvchi topilmadi");
        }

        const rank = await this.userService.getUserRank(userId);

        let text = `👤 <b>Foydalanuvchi ma'lumotlari</b>\n\n`;
        text += `📛 Ism: <b>${user.firstName}</b>`;
        if (user.lastName) text += ` ${user.lastName}`;
        text += '\n';
        if (user.username) text += `👤 Username: @${user.username}\n`;
        text += `📱 Telefon: <code>${user.phone}</code>\n`;
        text += `💰 Ball: <b>${user.points}</b>\n`;
        text += `🏆 O'rin: <b>#${rank}</b>\n`;
        text += `👥 Taklif qilganlar: <b>${user.referrals.length}</b> ta\n`;
        text += `📅 Qo'shilgan: ${user.createdAt.toLocaleDateString('uz-UZ')}\n`;
        text += `\n🔗 Referral kod: <code>${user.referralCode}</code>\n`;

        if (user.isBanned) {
            text += `\n🚫 <b>BLOKLANGAN</b>`;
            if (user.banReason) text += `: ${user.banReason}`;
        }

        const keyboard = new InlineKeyboard();

        if (user.username) {
            keyboard.url(`👤 Profilni ko'rish`, `tg://user?id=${user.telegramId}`).row();
        }

        if (user.isBanned) {
            keyboard.text('✅ Blokdan chiqarish', `unban_user_${userId}`);
        } else {
            keyboard.text('🚫 Bloklash', `ban_user_${userId}`);
        }
        keyboard.row();
        keyboard.text(`${EMOJI.BACK} Orqaga`, 'admin_users');

        await ctx.editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
    }

    private async showAdminChannels(ctx: BotContext) {
        const channels = await this.channelService.getAllChannels();

        let text = `${EMOJI.CHANNEL} <b>Kanallar ro'yxati</b>\n\n`;
        if (channels.length === 0) {
            text += "Hozircha kanallar yo'q.";
        } else {
            channels.forEach((ch, i) => {
                const status = ch.isActive ? EMOJI.CHECK : EMOJI.CROSS;
                const type = ch.isPrivate ? '🔒' : '🌐';
                text += `${i + 1}. ${status} ${type} ${ch.title}\n`;
            });
        }

        const keyboard = new InlineKeyboard();

        channels.forEach((ch) => {
            const status = ch.isActive ? '🟢' : '🔴';
            keyboard.text(`${status} ${ch.title.slice(0, 15)}`, `toggle_channel_${ch.id}`);
            keyboard.text('🗑', `delete_channel_${ch.id}`);
            keyboard.row();
        });

        keyboard.text('➕ Kanal qo\'shish', 'add_channel').row();
        keyboard.text(`${EMOJI.BACK} Orqaga`, 'admin_back');

        await ctx.editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
    }

    private async showAdminContest(ctx: BotContext) {
        const contest = await this.contestService.getActiveContest();
        const lastContest = await this.prisma.contest.findFirst({
            where: { isActive: false },
            orderBy: { endDate: 'desc' },
        });

        let text = `${EMOJI.CONTEST} <b>Konkurs boshqaruvi</b>\n\n`;

        if (contest) {
            text += `📝 <b>Faol konkurs:</b> ${contest.title}\n`;
            text += `📅 Tugash: ${this.contestService.formatDate(contest.endDate)}\n`;
            text += `⏱️ Qolgan vaqt: ${this.contestService.getTimeRemaining(contest.endDate)}`;
        } else {
            text += "Hozircha faol konkurs yo'q.";
        }

        const keyboard = new InlineKeyboard();

        if (contest) {
            keyboard.text('📝 Tahrirlash', 'contest_edit').row();
            keyboard.text('🔴 To\'xtatish', 'contest_stop').row();
        } else {
            keyboard.text('➕ Yangi konkurs', 'contest_create').row();
        }

        if (lastContest) {
            keyboard.text('📊 Oxirgi natijalar', 'contest_results').row();
        }

        keyboard.text(`${EMOJI.BACK} Orqaga`, 'admin_back');

        await ctx.editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
    }

    private async showContestEditMenu(ctx: BotContext) {
        const contest = await this.contestService.getActiveContest();
        if (!contest) {
            return ctx.editMessageText("Faol konkurs yo'q", {
                reply_markup: getAdminMenuKeyboard(),
                parse_mode: 'HTML',
            });
        }

        const hasImage = contest.imageUrl ? '✅' : '❌';
        const text = `📝 <b>Konkursni tahrirlash</b>\n\n` +
            `📌 Nom: ${contest.title}\n` +
            `📖 Tavsif: ${contest.description.slice(0, 100)}...\n` +
            `🎁 Sovrinlar: ${contest.prizes.slice(0, 100)}...\n` +
            `🖼 Rasm: ${hasImage}\n` +
            `📅 Tugash: ${this.contestService.formatDate(contest.endDate)}`;

        const keyboard = new InlineKeyboard()
            .text("📌 Nomni o'zgartirish", 'contest_edit_title').row()
            .text("📖 Tavsifni o'zgartirish", 'contest_edit_desc').row()
            .text("🎁 Sovrinlarni o'zgartirish", 'contest_edit_prizes').row()
            .text("🖼 Rasmni o'zgartirish", 'contest_edit_image').row()
            .text("📅 Sanani o'zgartirish", 'contest_edit_date').row()
            .text(`${EMOJI.BACK} Orqaga`, 'admin_contest');

        await ctx.editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
    }

    private async showContestResults(ctx: BotContext) {
        const topUsers = await this.userService.getTopUsers(20);

        let text = `🏆 <b>KONKURS NATIJALARI</b>\n\n`;

        if (topUsers.length === 0) {
            text += "Ishtirokchilar yo'q.";
        } else {
            topUsers.forEach((u, i) => {
                let medal = '';
                if (i === 0) medal = '🥇';
                else if (i === 1) medal = '🥈';
                else if (i === 2) medal = '🥉';
                else medal = `${i + 1}.`;

                const username = u.username ? `@${u.username}` : u.firstName;
                text += `${medal} ${username} — <b>${u.points}</b> ball\n`;
            });
        }

        const keyboard = new InlineKeyboard();

        // Top 3 users with profile links
        topUsers.slice(0, 3).forEach((u, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
            const label = u.username ? `${medal} @${u.username}` : `${medal} ${u.firstName}`;
            keyboard.url(label, `tg://user?id=${u.telegramId}`);
        });
        keyboard.row();

        keyboard.text(`${EMOJI.BACK} Orqaga`, 'admin_contest');

        await ctx.editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
    }

    private async showAdminTerms(ctx: BotContext) {
        const termsSetting = await this.prisma.settings.findUnique({
            where: { key: 'terms' },
        });

        const currentTerms = termsSetting?.value || MESSAGES.TERMS_TEXT;

        const text = `${EMOJI.TERMS} <b>Shartlar boshqaruvi</b>\n\n` +
            `Joriy shartlar:\n\n${currentTerms.slice(0, 500)}...`;

        const keyboard = new InlineKeyboard()
            .text("📝 Shartlarni o'zgartirish", 'edit_terms').row()
            .text(`${EMOJI.BACK} Orqaga`, 'admin_back');

        await ctx.editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
    }

    private async showAdminContact(ctx: BotContext) {
        const contactSetting = await this.prisma.settings.findUnique({
            where: { key: 'contact' },
        });

        const defaultContact = `${EMOJI.CONTACT} <b>ALOQA</b>

Savollar va takliflar uchun:

👤 Admin: @admin

⏰ Javob berish vaqti: 09:00 - 21:00`;

        const currentContact = contactSetting?.value || defaultContact;

        const text = `${EMOJI.CONTACT} <b>Aloqa boshqaruvi</b>\n\n` +
            `Joriy aloqa matni:\n\n${currentContact.slice(0, 500)}`;

        const keyboard = new InlineKeyboard()
            .text("📝 Aloqani o'zgartirish", 'edit_contact').row()
            .text(`${EMOJI.BACK} Orqaga`, 'admin_back');

        await ctx.editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
    }

    // ==================== HANDLER METHODS ====================

    private async handleAddChannel(ctx: BotContext, input: string) {
        try {
            let channelId = input.trim();

            // Link formatini parse qilish
            if (channelId.includes('t.me/')) {
                const match = channelId.match(/t\.me\/([+\w]+)/);
                if (match) {
                    const extracted = match[1];
                    // Invite link (+) bo'lsa - bu ishlamaydi
                    if (extracted.startsWith('+')) {
                        return ctx.reply(
                            `${EMOJI.CROSS} <b>Invite link qo'llab-quvvatlanmaydi!</b>\n\n` +
                            `Iltimos, quyidagilardan birini yuboring:\n` +
                            `• Username: <code>@kanal_username</code>\n` +
                            `• Kanal ID: <code>-1001234567890</code>\n\n` +
                            `<i>Bot kanalda admin bo'lishi kerak!</i>`,
                            { reply_markup: getCancelKeyboard(), parse_mode: 'HTML' }
                        );
                    }
                    channelId = `@${extracted}`;
                }
            }

            // @ qo'shish (agar yo'q bo'lsa va raqam bilan boshlanmasa)
            if (!channelId.startsWith('@') && !channelId.startsWith('-')) {
                channelId = `@${channelId}`;
            }

            // Mavjudligini tekshirish
            const existing = await this.channelService.findByChannelId(channelId);
            if (existing) {
                return ctx.reply(MESSAGES.CHANNEL_EXISTS, { reply_markup: getCancelKeyboard() });
            }

            // Kanal ma'lumotlarini olish
            const channelInfo = await this.channelService.getChannelInfo(this.bot, channelId);
            if (!channelInfo) {
                return ctx.reply(MESSAGES.CHANNEL_NOT_FOUND, { reply_markup: getCancelKeyboard() });
            }

            await this.channelService.addChannel({
                channelId,
                title: channelInfo.title,
                isPrivate: channelInfo.isPrivate,
            });

            ctx.session.adminStep = undefined;

            await ctx.reply(MESSAGES.CHANNEL_ADDED(channelInfo.title), {
                reply_markup: getAdminMenuKeyboard(),
            });
        } catch (error) {
            this.logger.error("Kanal qo'shishda xatolik:", error);
            await ctx.reply(MESSAGES.CHANNEL_NOT_FOUND, { reply_markup: getCancelKeyboard() });
        }
    }

    private async handleContestDate(ctx: BotContext, dateStr: string) {
        const endDate = new Date(dateStr.replace(' ', 'T'));

        if (isNaN(endDate.getTime())) {
            return ctx.reply(MESSAGES.CONTEST_INVALID_DATE);
        }

        const { title, description, prizes } = ctx.session.newContest!;

        await this.contestService.create({
            title: title!,
            description: description!,
            prizes: prizes!,
            endDate,
        });

        ctx.session.adminStep = undefined;
        ctx.session.newContest = undefined;

        await ctx.reply(MESSAGES.CONTEST_CREATED, {
            reply_markup: getAdminMenuKeyboard(),
        });
    }

    private async handleContestEdit(ctx: BotContext, step: string, value: string) {
        const contest = await this.contestService.getActiveContest();
        if (!contest) {
            ctx.session.adminStep = undefined;
            return ctx.reply("Faol konkurs yo'q", { reply_markup: getAdminMenuKeyboard() });
        }

        const updateData: any = {};
        let fieldName = '';

        switch (step) {
            case 'edit_contest_title':
                updateData.title = value;
                fieldName = 'Nom';
                break;
            case 'edit_contest_description':
                updateData.description = value;
                fieldName = 'Tavsif';
                break;
            case 'edit_contest_prizes':
                updateData.prizes = value;
                fieldName = 'Sovrinlar';
                break;
            case 'edit_contest_date':
                const endDate = new Date(value.replace(' ', 'T'));
                if (isNaN(endDate.getTime())) {
                    return ctx.reply(MESSAGES.CONTEST_INVALID_DATE);
                }
                updateData.endDate = endDate;
                fieldName = 'Sana';
                break;
        }

        await this.contestService.update(contest.id, updateData);
        ctx.session.adminStep = undefined;

        // Xabar yuborib, keyin tahrirlash menyusiga qaytarish
        await ctx.reply(`${EMOJI.CHECK} ${fieldName} yangilandi!`);

        // Yangilangan kontestni olish va edit menyusini ko'rsatish
        const updatedContest = await this.contestService.getActiveContest();
        if (updatedContest) {
            const hasImage = updatedContest.imageUrl ? '✅' : '❌';
            const text = `📝 <b>Konkursni tahrirlash</b>\n\n` +
                `📌 Nom: ${updatedContest.title}\n` +
                `📖 Tavsif: ${updatedContest.description.slice(0, 100)}...\n` +
                `🎁 Sovrinlar: ${updatedContest.prizes.slice(0, 100)}...\n` +
                `🖼 Rasm: ${hasImage}\n` +
                `📅 Tugash: ${this.contestService.formatDate(updatedContest.endDate)}`;

            const keyboard = new InlineKeyboard()
                .text("📌 Nomni o'zgartirish", 'contest_edit_title').row()
                .text("📖 Tavsifni o'zgartirish", 'contest_edit_desc').row()
                .text("🎁 Sovrinlarni o'zgartirish", 'contest_edit_prizes').row()
                .text("🖼 Rasmni o'zgartirish", 'contest_edit_image').row()
                .text("📅 Sanani o'zgartirish", 'contest_edit_date').row()
                .text(`${EMOJI.BACK} Orqaga`, 'admin_contest');

            await ctx.reply(text, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });
        }
    }

    private async handleContestImageEdit(ctx: BotContext, imageFileId: string) {
        const contest = await this.contestService.getActiveContest();
        if (!contest) {
            ctx.session.adminStep = undefined;
            return ctx.reply("Faol konkurs yo'q", { reply_markup: getAdminMenuKeyboard() });
        }

        await this.contestService.update(contest.id, { imageUrl: imageFileId });
        ctx.session.adminStep = undefined;

        // Xabar yuborib, keyin tahrirlash menyusiga qaytarish
        await ctx.reply(`${EMOJI.CHECK} Rasm yangilandi!`);

        // Yangilangan kontestni olish va edit menyusini ko'rsatish
        const updatedContest = await this.contestService.getActiveContest();
        if (updatedContest) {
            const hasImage = updatedContest.imageUrl ? '✅' : '❌';
            const text = `📝 <b>Konkursni tahrirlash</b>\n\n` +
                `📌 Nom: ${updatedContest.title}\n` +
                `📖 Tavsif: ${updatedContest.description.slice(0, 100)}...\n` +
                `🎁 Sovrinlar: ${updatedContest.prizes.slice(0, 100)}...\n` +
                `🖼 Rasm: ${hasImage}\n` +
                `📅 Tugash: ${this.contestService.formatDate(updatedContest.endDate)}`;

            const keyboard = new InlineKeyboard()
                .text("📌 Nomni o'zgartirish", 'contest_edit_title').row()
                .text("📖 Tavsifni o'zgartirish", 'contest_edit_desc').row()
                .text("🎁 Sovrinlarni o'zgartirish", 'contest_edit_prizes').row()
                .text("🖼 Rasmni o'zgartirish", 'contest_edit_image').row()
                .text("📅 Sanani o'zgartirish", 'contest_edit_date').row()
                .text(`${EMOJI.BACK} Orqaga`, 'admin_contest');

            await ctx.reply(text, {
                reply_markup: keyboard,
                parse_mode: 'HTML',
            });
        }
    }

    private async handleTermsEdit(ctx: BotContext, text: string) {
        await this.prisma.settings.upsert({
            where: { key: 'terms' },
            update: { value: text },
            create: { key: 'terms', value: text },
        });

        ctx.session.adminStep = undefined;
        await ctx.reply(`${EMOJI.CHECK} Shartlar yangilandi!`, {
            reply_markup: getAdminMenuKeyboard(),
        });
    }

    private async handleContactEdit(ctx: BotContext, text: string) {
        await this.prisma.settings.upsert({
            where: { key: 'contact' },
            update: { value: text },
            create: { key: 'contact', value: text },
        });

        ctx.session.adminStep = undefined;
        await ctx.reply(`${EMOJI.CHECK} Aloqa ma'lumotlari yangilandi!`, {
            reply_markup: getAdminMenuKeyboard(),
        });
    }

    /**
     * Broadcast xabar preview ko'rsatish
     */
    private async showBroadcastPreview(ctx: BotContext) {
        const { broadcastType, broadcastContent, broadcastButtons } = ctx.session;
        const count = await this.userService.getParticipantCount();

        let previewText = `📤 <b>Xabar ko'rib chiqish</b>\n\n`;
        previewText += `👥 Yuboriladi: <b>${count}</b> ta foydalanuvchiga\n`;
        previewText += `📝 Turi: <b>${broadcastType || 'text'}</b>\n`;

        if (broadcastButtons && broadcastButtons.length > 0) {
            previewText += `🔘 Tugmalar: <b>${broadcastButtons.length}</b> ta\n`;
            broadcastButtons.forEach((b, i) => {
                previewText += `   ${i + 1}. ${b.text}\n`;
            });
        }

        previewText += `\n<b>Xabar:</b>\n${(broadcastContent || '').slice(0, 200)}`;
        if ((broadcastContent || '').length > 200) previewText += '...';

        const keyboard = new InlineKeyboard()
            .text('🔘 Tugma qo\'shish', 'broadcast_add_button').row();

        if (broadcastButtons && broadcastButtons.length > 0) {
            keyboard.text('🗑 Tugmalarni o\'chirish', 'broadcast_remove_buttons').row();
        }

        keyboard
            .text(`${EMOJI.CHECK} Yuborish`, 'broadcast_confirm')
            .text(`${EMOJI.CROSS} Bekor qilish`, 'broadcast_cancel');

        await ctx.reply(previewText, {
            reply_markup: keyboard,
            parse_mode: 'HTML',
        });
    }

    private async executeBroadcast(ctx: BotContext) {
        const { broadcastType, broadcastMedia, broadcastContent, broadcastButtons } = ctx.session;

        await ctx.editMessageText(`${EMOJI.ROCKET} Xabarlar yuborilmoqda...`, { parse_mode: 'HTML' });

        const users = await this.prisma.user.findMany({
            where: { isParticipant: true, isBanned: false },
            select: { telegramId: true },
        });

        let sent = 0;
        let failed = 0;

        const content = broadcastContent || '';

        // Build inline keyboard from session buttons
        let replyMarkup: InlineKeyboard | undefined;
        if (broadcastButtons && broadcastButtons.length > 0) {
            replyMarkup = new InlineKeyboard();
            broadcastButtons.forEach((btn) => {
                replyMarkup!.url(btn.text, btn.url).row();
            });
        }

        for (const user of users) {
            try {
                const chatId = user.telegramId.toString();

                if (broadcastType === 'photo' && broadcastMedia) {
                    await this.bot.api.sendPhoto(chatId, broadcastMedia, {
                        caption: content,
                        parse_mode: 'HTML',
                        reply_markup: replyMarkup,
                    });
                } else if (broadcastType === 'video' && broadcastMedia) {
                    await this.bot.api.sendVideo(chatId, broadcastMedia, {
                        caption: content,
                        parse_mode: 'HTML',
                        reply_markup: replyMarkup,
                    });
                } else {
                    await this.bot.api.sendMessage(chatId, content, {
                        parse_mode: 'HTML',
                        reply_markup: replyMarkup,
                    });
                }
                sent++;

                // Rate limiting
                if (sent % 30 === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            } catch (error) {
                failed++;
                this.logger.warn(`Xabar yuborishda xatolik: ${user.telegramId}`);
            }
        }

        // Log saqlash
        await this.prisma.broadcastLog.create({
            data: {
                adminId: BigInt(ctx.from?.id || 0),
                messageType: broadcastType || 'text',
                content: content,
                sentCount: sent,
                failedCount: failed,
            },
        });

        ctx.session.broadcastType = undefined;
        ctx.session.broadcastMedia = undefined;
        ctx.session.broadcastContent = undefined;
        ctx.session.broadcastButtons = undefined;
        ctx.session.adminStep = undefined;

        await ctx.editMessageText(MESSAGES.BROADCAST_COMPLETE(sent, failed), {
            reply_markup: getAdminMenuKeyboard(),
            parse_mode: 'HTML',
        });
    }

    // ==================== USER MENU METHODS ====================

    private isAdmin(telegramId: number): boolean {
        return this.adminIds.includes(telegramId);
    }

    /**
     * Har bir menu amaldan oldin kanal obunani tekshiradi.
     * Agar foydalanuvchi kanaldan chiqib ketgan bo'lsa, qayta obuna qilishni talab qiladi.
     */
    private async withSubscriptionCheck(ctx: BotContext, action: () => Promise<any>): Promise<any> {
        const telegramId = ctx.from?.id;
        if (!telegramId) return;

        // Admin tekshirmasdan o'tadi
        if (this.isAdmin(telegramId)) {
            return action();
        }

        // Faol kanallar bormi tekshirish
        const channels = await this.channelService.getActiveChannels();
        if (channels.length === 0) {
            return action();
        }

        // Obunani tekshirish
        const result = await this.channelService.checkUserSubscription(this.bot, telegramId);

        if (result.allSubscribed) {
            // Hamma kanallarga obuna - davom etish
            return action();
        } else {
            // Kanaldan chiqib ketgan - qayta obuna qilishni talab qilish
            await ctx.reply(
                `${EMOJI.CROSS} <b>Siz quyidagi kanallardan chiqib ketgansiz!</b>\n\n` +
                `Iltimos, davom etish uchun kanallarga qayta obuna bo'ling:\n\n` +
                result.unsubscribedChannels.map((ch, i) => `${i + 1}. ${ch.title}`).join('\n'),
                {
                    reply_markup: getChannelsKeyboard(result.unsubscribedChannels),
                    parse_mode: 'HTML',
                },
            );
            return; // Amaliyotni to'xtatish
        }
    }

    private async showChannels(ctx: BotContext) {
        const channels = await this.channelService.getActiveChannels();

        if (channels.length === 0) {
            await ctx.reply(MESSAGES.NO_CHANNELS);
            await ctx.reply(MESSAGES.WELCOME_BACK, {
                reply_markup: getMainMenuKeyboard(),
            });
            return;
        }

        await ctx.reply(MESSAGES.SUBSCRIBE_CHANNELS, {
            reply_markup: getChannelsKeyboard(channels),
        });
    }

    private async showContest(ctx: BotContext) {
        const contest = await this.contestService.getActiveContest();
        const telegramId = ctx.from?.id;
        if (!telegramId) return;

        if (!contest) {
            return ctx.reply(MESSAGES.NO_ACTIVE_CONTEST);
        }

        const user = await this.userService.findByTelegramId(telegramId);
        const participantCount = await this.userService.getParticipantCount();
        const botInfo = await this.bot.api.getMe();

        const referralLink = `https://t.me/${botInfo.username}?start=${user?.referralCode}`;

        const text =
            `🎯 <b>${contest.title}</b>\n\n` +
            `📖 <b>Tavsif:</b>\n${contest.description}\n\n` +
            `🎁 <b>Sovrinlar:</b>\n${contest.prizes}\n\n` +
            `📅 <b>Tugash:</b> ${this.contestService.formatDate(contest.endDate)}\n` +
            `⏱️ <b>Qolgan vaqt:</b> ${this.contestService.getTimeRemaining(contest.endDate)}\n\n` +
            `👥 <b>Ishtirokchilar:</b> ${participantCount} ta\n\n` +
            `🔗 <b>Sizning referral linkingiz:</b>\n<code>${referralLink}</code>\n\n` +
            `💡 Har bir taklif = <b>+${this.pointsPerReferral}</b> ball! 🎉`;

        // Agar rasm bor bo'lsa, rasm bilan yuborish
        if (contest.imageUrl) {
            await ctx.replyWithPhoto(contest.imageUrl, {
                caption: text,
                parse_mode: 'HTML',
                reply_markup: getReferralKeyboard(referralLink),
            });
        } else {
            await ctx.reply(text, {
                reply_markup: getReferralKeyboard(referralLink),
            });
        }
    }

    private async showPrizes(ctx: BotContext) {
        const contest = await this.contestService.getActiveContest();

        if (!contest) {
            return ctx.reply(MESSAGES.NO_ACTIVE_CONTEST);
        }

        const text =
            `${EMOJI.GIFT} <b>KONKURS SOVRINLARI</b>\n\n` +
            `${contest.prizes}\n\n` +
            `🏆 <b>G'oliblar:</b> Konkurs tugagandan so'ng e'lon qilinadi`;

        await ctx.reply(text);
    }

    private async showPoints(ctx: BotContext) {
        const telegramId = ctx.from?.id;
        if (!telegramId) return;

        const user = await this.userService.findByTelegramId(telegramId);
        if (!user) {
            return ctx.reply(MESSAGES.ERROR);
        }

        const referralCount = await this.userService.getReferralCount(user.id);
        const history = await this.userService.getPointHistory(user.id, 5);
        const botInfo = await this.bot.api.getMe();

        let historyText = '';
        if (history.length > 0) {
            historyText =
                "\n\n📊 <b>So'nggi harakatlar:</b>\n" +
                history.map((h) => `• +${h.amount} ball - ${h.note || h.reason}`).join('\n');
        }

        const referralLink = `https://t.me/${botInfo.username}?start=${user.referralCode}`;

        const text =
            `${MESSAGES.YOUR_POINTS(user.points, referralCount)}${historyText}\n\n` +
            `🔗 <b>Referral link:</b>\n<code>${referralLink}</code>`;

        await ctx.reply(text, {
            reply_markup: getReferralKeyboard(referralLink),
        });
    }

    private async showRating(ctx: BotContext) {
        const telegramId = ctx.from?.id;
        if (!telegramId) return;

        const topUsers = await this.userService.getTopUsers(10);
        const user = await this.userService.findByTelegramId(telegramId);

        let text = MESSAGES.RATING_HEADER + '\n';

        topUsers.forEach((u, i) => {
            let medal = '';
            if (i === 0) medal = EMOJI.GOLD;
            else if (i === 1) medal = EMOJI.SILVER;
            else if (i === 2) medal = EMOJI.BRONZE;
            else medal = `${i + 1}.`;

            const username = u.username ? `@${u.username}` : u.firstName;
            text += `${medal} ${username} — <b>${u.points}</b> ball\n`;
        });

        if (user) {
            const rank = await this.userService.getUserRank(user.id);
            // Qisqartirilgan border
            text += `\n┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
            text += `📍 Sizning o'rningiz: <b>#${rank}</b>\n`;
            text += `💎 Sizning ballingiz: <b>${user.points}</b> ball`;
        }

        await ctx.reply(text);
    }

    private async showTerms(ctx: BotContext) {
        const termsSetting = await this.prisma.settings.findUnique({
            where: { key: 'terms' },
        });

        const termsText = termsSetting?.value || MESSAGES.TERMS_TEXT;
        await ctx.reply(termsText);
    }

    private async showContact(ctx: BotContext) {
        const contactSetting = await this.prisma.settings.findUnique({
            where: { key: 'contact' },
        });

        const defaultContact = `${EMOJI.CONTACT} <b>ALOQA</b>

Savollar va takliflar uchun:

👤 Admin: @admin

⏰ Javob berish vaqti: 09:00 - 21:00`;

        await ctx.reply(contactSetting?.value || defaultContact, { parse_mode: 'HTML' });
    }

    private async startBot() {
        try {
            const webhookUrl = this.configService.get<string>('bot.webhookUrl');
            const botInfo = await this.bot.api.getMe();
            this.logger.log(`🤖 Bot: @${botInfo.username}`);

            if (webhookUrl) {
                // Webhook rejimi (production)
                await this.bot.api.setWebhook(webhookUrl, {
                    drop_pending_updates: true,
                });
                this.logger.log(`🌐 Webhook rejimida ishlamoqda: ${webhookUrl}`);
            } else {
                // Polling rejimi (development)
                await this.bot.api.deleteWebhook();
                this.runner = run(this.bot);
                this.logger.log(`✅ Polling rejimida ishlamoqda!`);
            }
        } catch (error) {
            this.logger.error('Bot ishga tushirishda xatolik:', error);
            throw error;
        }
    }

    /**
     * Webhook uchun update qabul qilish (NestJS controller orqali)
     */
    async handleUpdate(update: any) {
        await this.bot.handleUpdate(update);
    }
}
