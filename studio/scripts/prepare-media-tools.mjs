// Pin the exact release files shipped in Studio. The SHA-256 values are from
// the release assets; a changed or incomplete download must fail the build.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../src-tauri/binaries/', import.meta.url));
const base = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/';
const youtubeBase = 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/';
const youtubeLicense = 'https://raw.githubusercontent.com/yt-dlp/yt-dlp/2026.08.19/LICENSE';
const youtubeLicenseSha = '7e12e5df4bae12cb21581ba157ced20e1986a0508dd10d0e8a4ab9a4cf94e85c';
const platforms = {
	'aarch64-apple-darwin': {
		arch: 'aarch64',
		suffix: '',
		youtube: ['yt-dlp_macos', '0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202']
	},
	'x86_64-apple-darwin': {
		asset: 'darwin-x64',
		arch: 'x86_64',
		suffix: '',
		youtube: ['yt-dlp_macos', '0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202'],
		sha: [
			'ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894',
			'2e1d16c72fd74e12063776371da757322f8b77589386532f4fd8634bde7de1af',
			'e88a0325f8e5b75210355e37341824f074d3cd82def2125be54c914b62848a36'
		]
	},
	'x86_64-pc-windows-msvc': {
		asset: 'win32-x64',
		arch: 'x86_64',
		suffix: '.exe',
		youtube: ['yt-dlp.exe', '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a'],
		sha: [
			'04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00',
			'8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903',
			'a636a7183c58006351acbaf35303c0ed85c6e1320fd4e80de453ba6157de6311'
		]
	},
	'x86_64-unknown-linux-gnu': {
		asset: 'linux-x64',
		arch: 'x86_64',
		suffix: '',
		youtube: ['yt-dlp_linux', '58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a'],
		sha: [
			'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99',
			'8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903',
			'72f4b1b06d419d22ace6e7cc75f06826f90737345aa0b1736158929f4aacc537'
		]
	},
	'aarch64-unknown-linux-gnu': {
		asset: 'linux-arm64',
		arch: 'aarch64',
		suffix: '',
		youtube: [
			'yt-dlp_linux_aarch64',
			'b16e4dab368a816cd05d477d698a605a6ae87ccee1c8ffd38fa21d7254141fcc'
		],
		sha: [
			'6bb182d0d75d23028db82e9e4f723ca69b853d055698486e6984ddb2c06fb8ce',
			'8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903',
			'd6777d2fd276b23f0ac6666fa619e88ffe4826521881c7ff83836e30cb4acec2'
		]
	}
};

const targets = process.argv.slice(2);
if (targets.length === 0) {
	const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
	const os = { darwin: 'apple-darwin', win32: 'pc-windows-msvc', linux: 'unknown-linux-gnu' }[
		process.platform
	];
	if (!os) throw new Error(`Unsupported Studio build platform: ${process.platform}`);
	targets.push(`${arch}-${os}`);
}

await mkdir(directory, { recursive: true });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function prepare(url, name, expected, executable = false) {
	const destination = join(directory, name);
	try {
		if (digest(await readFile(destination)) === expected) return;
	} catch {
		/* download missing file */
	}
	let bytes;
	for (let attempt = 1; attempt <= 5; attempt++) {
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			bytes = Buffer.from(await response.arrayBuffer());
			if (digest(bytes) !== expected) throw new Error('checksum mismatch');
			break;
		} catch (error) {
			if (attempt === 5) throw new Error(`Dependency download failed: ${url}: ${error}`);
			console.warn(`Retrying media tool download (${attempt}/5): ${error}`);
			await setTimeout(1_000 * attempt);
		}
	}
	const temporary = `${destination}.partial`;
	try {
		await writeFile(temporary, bytes);
		if (executable && process.platform !== 'win32') await chmod(temporary, 0o755);
		await rename(temporary, destination);
	} finally {
		await rm(temporary, { force: true });
	}
	console.log(`Prepared ${name}`);
}

for (const target of targets) {
	const platform = platforms[target];
	if (!platform) throw new Error(`Unsupported Studio build target: ${target}`);
	if (target === 'aarch64-apple-darwin') {
		if (process.platform !== 'darwin' || process.arch !== 'arm64') {
			throw new Error('Apple Silicon FFmpeg must be built on an Apple Silicon macOS runner');
		}
		execFileSync('bash', [fileURLToPath(new URL('./build-macos-ffmpeg.sh', import.meta.url))], {
			stdio: 'inherit'
		});
	} else {
		const files = [
			[`ffmpeg-${platform.asset}`, `ffmpeg-${platform.arch}${platform.suffix}`],
			[`${platform.asset}.LICENSE`, `ffmpeg-${platform.arch}.LICENSE`],
			[`${platform.asset}.README`, `ffmpeg-${platform.arch}.README`]
		];
		for (const [index, [source, name]] of files.entries()) {
			await prepare(base + source, name, platform.sha[index], index === 0);
		}
	}
	await prepare(
		youtubeBase + platform.youtube[0],
		`yt-dlp-${platform.arch}${platform.suffix}`,
		platform.youtube[1],
		true
	);
}
await prepare(youtubeLicense, 'yt-dlp.LICENSE', youtubeLicenseSha);
