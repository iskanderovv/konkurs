import { Context, SessionFlavor } from 'grammy';
import { HydrateFlavor } from '@grammyjs/hydrate';
import { ParseModeFlavor } from '@grammyjs/parse-mode';

// Session ma'lumotlari
export interface SessionData {
    // Ro'yxatdan o'tish jarayoni
    registrationStep?: 'phone' | 'subscribe';
    referralCode?: string;

    // Admin jarayonlari
    adminStep?:
    | 'add_channel'
    | 'broadcast'
    | 'broadcast_button_name'
    | 'broadcast_button_url'
    | 'contest_title'
    | 'contest_description'
    | 'contest_prizes'
    | 'contest_image'
    | 'contest_date'
    | 'edit_contest_title'
    | 'edit_contest_description'
    | 'edit_contest_prizes'
    | 'edit_contest_image'
    | 'edit_contest_date'
    | 'edit_terms'
    | 'edit_contact';

    // Broadcast
    broadcastType?: 'text' | 'photo' | 'video';
    broadcastMedia?: string;
    broadcastContent?: string;
    broadcastButtons?: { text: string; url: string }[];
    tempButtonName?: string;

    // Contest yaratish uchun
    newContest?: {
        title?: string;
        description?: string;
        prizes?: string;
        imageUrl?: string;
        endDate?: Date;
    };
}

// Bot context turi
export type BotContext = HydrateFlavor<
    ParseModeFlavor<Context & SessionFlavor<SessionData>>
>;
