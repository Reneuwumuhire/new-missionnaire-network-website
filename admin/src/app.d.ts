import type { AdminUser } from '$lib/models/admin-user';

declare global {
	namespace App {
		interface Locals {
			user: AdminUser;
		}
	}
}

export {};
