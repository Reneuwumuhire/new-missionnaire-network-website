import { z } from 'zod';
import { TimestampType } from './media-assets';

export const UserBasicInfoSchema = z.object({
	name: z.string(),
	id: z.string(),
	picture: z.string().url()
});
export type UserBasicInfo = z.infer<typeof UserBasicInfoSchema>;

export const DocumentBaseSchema = z.object({
	createdBy: UserBasicInfoSchema,
	updatedBy: UserBasicInfoSchema,
	creationTime: TimestampType,
	lastUpdate: TimestampType,
	docId: z.string(),
	docPath: z.string()
});
export type DocumentBase = z.infer<typeof DocumentBaseSchema>;

export const UserSchema = DocumentBaseSchema.extend({
	id: z.string(),
	name: z.string(),
	picture: z.string().url(),
	status: z.enum(['disabled', 'active', 'inactive'])
});
export type User = z.infer<typeof UserSchema>;

export const NewUserSchema = UserBasicInfoSchema.extend({
	status: z.enum(['disabled', 'active'])
});
export type UserInfo = z.infer<typeof NewUserSchema>;

export const NewUserSessionSchema = z.object({
	access_token: z.string(),
	expiry_date: z.number(),
	id_token: z.string(),
	scope: z.string().transform((a) => a.split(' ')),
	token_type: z.string(),
	status: z.enum(['valid', 'invalid'])
});
export type NewUserSession = z.infer<typeof NewUserSessionSchema>;

export const UserSessionSchema = DocumentBaseSchema.extend({
	access_token: z.string(),
	expiry_date: z.number(),
	id_token: z.string(),
	scope: z.string().array(),
	token_type: z.string(),
	status: z.enum(['valid', 'invalid'])
});

export type UserSession = z.infer<typeof UserSessionSchema>;

export const ChannelAccountSchema = z.object({
	id: z.string(),
	name: z.string(),
	given_name: z.string(),
	picture: z.string().url(),
	default: z.boolean()
});
export const ChannelAccountDocSchema = DocumentBaseSchema.merge(ChannelAccountSchema);
export type ChannelAccountDoc = z.infer<typeof ChannelAccountDocSchema>;
export type ChannelAccount = z.infer<typeof ChannelAccountSchema>;

export const AccountCredentialsSchema = z.object({
	/**
	 * This field is only present if the access_type parameter was set to offline in the authentication request. For details, see Refresh tokens.
	 */
	refresh_token: z.string().optional(),
	/**
	 * The time in ms at which this token is thought to expire.
	 */
	expiry_date: z.number().optional(),
	/**
	 * A token that can be sent to a Google API.
	 */
	access_token: z.string().optional(),
	/**
	 * Identifies the type of token returned. At this time, this field always has the value Bearer.
	 */
	token_type: z.string().optional(),
	/**
	 * A JWT that contains identity information about the user that is digitally signed by Google.
	 */
	id_token: z.string().optional(),
	/**
	 * The scopes of access granted by the access_token expressed as a list of space-delimited, case-sensitive strings.
	 */
	scope: z.string().array().optional()
});
export type AccountCredentials = z.infer<typeof AccountCredentialsSchema>;
export const AccountCredentialsDocSchema = DocumentBaseSchema.merge(AccountCredentialsSchema);
