import { z } from 'zod';
import { objectIdString } from './mongo-input';

// Each action supplies only its own fields; handlers validate the fields they use.
export const studioYouTubeBody = z.object({
	action: z.string().max(30),
	sessionId: objectIdString.optional(),
	channelId: z.string().max(128).optional(),
	title: z.unknown().optional(),
	description: z.unknown().optional(),
	scheduledAt: z.unknown().optional(),
	privacyStatus: z.unknown().optional(),
	madeForKids: z.unknown().optional(),
	thumbnailUrl: z.unknown().optional(),
	thumbnailKey: z.unknown().optional(),
	subtitleUrl: z.unknown().optional(),
	subtitleKey: z.unknown().optional(),
	subtitleFilename: z.unknown().optional(),
	serviceType: z.unknown().optional(),
	announce: z.unknown().optional(),
	reminderEnabled: z.unknown().optional(),
	notifyOnStart: z.unknown().optional(),
	filename: z.unknown().optional(),
	contentType: z.unknown().optional(),
	size: z.unknown().optional(),
	deviceInfo: z.unknown().optional()
});
