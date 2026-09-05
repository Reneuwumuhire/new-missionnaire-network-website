import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	canViewDashboard,
	canManageMusicAudio,
	DEFAULT_PERMISSIONS,
	type AdminUser
} from './admin-user';

test('specialist dashboard access does not grant audio access', () => {
	const permissions = { ...DEFAULT_PERMISSIONS, can_add: false, can_edit: false };
	const user = { role: 'editor', permissions } as AdminUser;
	assert.equal(canViewDashboard(user), false);
	for (const permission of [
		'can_view_questions',
		'can_review_lyrics',
		'can_manage_recordings'
	] as const) {
		const specialist = { ...user, permissions: { ...permissions, [permission]: true } };
		assert.equal(canViewDashboard(specialist), true);
		assert.equal(canManageMusicAudio(specialist), false);
	}
	assert.equal(canViewDashboard({ ...user, role: 'superadmin' }), true);
});
