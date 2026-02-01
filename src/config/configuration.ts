export default () => ({
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    bot: {
        token: process.env.BOT_TOKEN!,
        adminIds: (process.env.ADMIN_IDS || '')
            .split(',')
            .map((id) => parseInt(id.trim(), 10))
            .filter((id) => !isNaN(id)),
        webhookUrl: process.env.WEBHOOK_URL || '',
    },

    points: {
        perReferral: parseInt(process.env.POINTS_PER_REFERRAL || '5', 10),
    },
});
