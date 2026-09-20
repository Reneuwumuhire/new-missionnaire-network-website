import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	canViewDashboard,
	getAdminLandingPath,
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

test('default landing follows effective permissions and preserves specialist fallbacks', () => {
	const user = { role: 'editor' } as AdminUser;
	assert.equal(getAdminLandingPath({ ...user, role: 'superadmin' }), '/');
	assert.equal(getAdminLandingPath(user), '/audio');
	const permissions = { ...DEFAULT_PERMISSIONS, can_add: false, can_edit: false };
	assert.equal(getAdminLandingPath({ ...user, permissions }), '/settings');
	for (const permission of ['can_add', 'can_edit', 'can_delete'] as const) {
		assert.equal(
			getAdminLandingPath({ ...user, permissions: { ...permissions, [permission]: true } }),
			'/audio'
		);
	}
	for (const can_add of [false, true]) {
		assert.equal(
			getAdminLandingPath({
				...user,
				permissions: { ...permissions, can_add, can_manage_recordings: true }
			}),
			'/recordings'
		);
	}
	for (const permission of ['can_view_questions', 'can_review_lyrics'] as const) {
		assert.equal(
			getAdminLandingPath({ ...user, permissions: { ...permissions, [permission]: true } }),
			'/'
		);
	}
});
