export const QUESTION_STATUSES = [
	'pending',
	'approved',
	'answered',
	'rejected',
	'hidden',
	'archived',
	'locked'
] as const;

export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const QUESTION_REFERENCE_TYPES = ['pdf', 'audio', 'video', 'sermon', 'text', 'music', 'bible'] as const;
export type QuestionReferenceType = (typeof QUESTION_REFERENCE_TYPES)[number];

export interface Question {
	_id: string;
	slug: string;
	title: string;
	body: string;
	authorId: string;
	authorDisplayName: string;
	authorRole?: string | null;
	status: QuestionStatus;
	category: string | null;
	tags: string[];
	officialAnswerId: string | null;
	replyCount: number;
	viewCount: number;
	reportCount: number;
	featured: boolean;
	locked: boolean;
	moderationReason: string | null;
	approvedAt: string | null;
	answeredAt: string | null;
	lastActivityAt: string;
	createdAt: string;
	updatedAt: string;
	deletedAt?: string | null;
}

export interface QuestionReply {
	_id: string;
	questionId: string;
	parentReplyId: string | null;
	body: string;
	authorId: string;
	authorDisplayName: string;
	authorRole?: string | null;
	isOfficial: boolean;
	visibilityStatus: 'visible' | 'hidden' | 'deleted';
	moderationReason: string | null;
	reportCount: number;
	createdAt: string;
	updatedAt: string;
	deletedAt?: string | null;
}

export interface QuestionReference {
	_id: string;
	questionId: string;
	replyId: string | null;
	type: QuestionReferenceType;
	referencedContentId: string;
	title: string;
	href: string;
	metadata: Record<string, unknown>;
	createdAt: string;
	createdBy: string;
}

export interface QuestionReport {
	_id: string;
	targetType: 'question' | 'reply';
	targetId: string;
	questionId: string;
	reporterId: string;
	reporterDisplayName: string;
	reason: string;
	notes: string | null;
	status: 'open' | 'reviewed' | 'dismissed';
	resolvedBy: string | null;
	resolvedAt: string | null;
	createdAt: string;
}

export interface ModerationAction {
	_id: string;
	targetType: string;
	targetId: string;
	moderatorId: string;
	moderatorDisplayName: string;
	action: string;
	reason: string | null;
	createdAt: string;
}

export interface ReferenceOption {
	id: string;
	type: QuestionReferenceType;
	title: string;
	href: string;
	metadata: Record<string, unknown>;
}
