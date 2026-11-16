import assert from 'node:assert/strict';
process.env.NODE_ENV = 'production';
process.env.MONGODB_URI = 'mongodb://127.0.0.1/?tls=false';
delete process.env.RAILWAY_PRIVATE_DOMAIN;

async function createRequest(app) {
	const { server } = await import(`../${app}/build/server/server.js`);
	await server.init({ env: process.env });
	return (path, init) =>
		server.respond(new Request(`https://security-gate.invalid${path}`, init), {
			getClientAddress: () => '127.0.0.1'
		});
}

function verifyHeaders(response) {
	assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
	assert.equal(response.headers.get('x-frame-options'), 'DENY');
	assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
	assert.equal(
		response.headers.get('permissions-policy'),
		'camera=(), microphone=(), geolocation=()'
	);
	assert.equal(response.headers.get('x-powered-by'), null);
}

async function verifyPage(request, path) {
	const res = await request(path);
	assert.equal(res.status, 200);
	verifyHeaders(res);
	const csp = res.headers.get('content-security-policy');
	const scripts = csp?.split(';').find((directive) => /^\s*script-src /.test(directive));
	const nonce = scripts?.match(/'nonce-([^']+)'/)?.[1];
	assert(nonce && !scripts.includes("'unsafe-inline'"));
	const tags = [...(await res.text()).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
	assert(tags.some(([, attributes]) => attributes.includes(`nonce="${nonce}"`)));
	for (const [, attrs, code] of tags) {
		if (code.trim() && !attrs.includes('application/ld+json')) {
			assert(attrs.includes(`nonce="${nonce}"`), 'Inline script requires the response nonce');
		}
	}
	return nonce;
}

let refusedDisabledTls = false;
const logError = console.error;
console.error = (...args) => {
	if (args.some((arg) => arg instanceof Error && /values of tls\/ssl/.test(arg.message))) {
		refusedDisabledTls = true;
		return;
	}
	logError(...args);
};
let web;
try {
	web = await createRequest('.');
	assert.notEqual(await verifyPage(web, '/a-propos'), await verifyPage(web, '/a-propos'));
} finally {
	console.error = logError;
}
assert(refusedDisabledTls, 'Public MongoDB connection must refuse a TLS-disabled URI');
const invalidNotification = await web('/api/notifications/ack', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ action: {}, tag: 'test' })
});
assert.equal(invalidNotification.status, 400);
const invalidPushEndpoint = await web('/api/notifications/subscribe', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({
		endpoint: 'https://untrusted.invalid/push',
		keys: { p256dh: 'test', auth: 'test' }
	})
});
assert.equal(invalidPushEndpoint.status, 400);

const admin = await createRequest('admin');
assert.notEqual(await verifyPage(admin, '/login'), await verifyPage(admin, '/login'));
for (const path of ['/users', '/api/stats', '/api/recordings/list']) {
	const res = await admin(path);
	assert.equal(res.status, 303, `Unauthenticated request to ${path}`);
	assert.equal(res.headers.get('location'), `/login?next=${encodeURIComponent(path)}`);
}
const { manifest } = await import('../admin/build/server/manifest.js');
const statsRoute = manifest.routes.find((route) => route.id === '/api/stats');
const { GET } = await statsRoute.endpoint();
await assert.rejects(GET({ cookies: { get: () => undefined } }), { status: 401 });
process.env.MONGODB_URI = 'mongodb://127.0.0.1/?tlsAllowInvalidCertificates=true';
try {
	console.error = (...args) => {
		if (!args[0]?.startsWith?.('[MongoDB Admin] Connection error')) logError(...args);
	};
	await assert.rejects(
		GET({ cookies: { get: () => 'e1d99b65-c125-483f-bc00-54202b59b100' } }),
		/MongoDB production connections require verified TLS/
	);
} finally {
	console.error = logError;
}
console.log(
	'Verified both production builds, security headers, nonce rotation, and unauthenticated admin routes.'
);
