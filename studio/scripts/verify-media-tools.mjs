import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../src-tauri/binaries/', import.meta.url));
const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
const suffix = process.platform === 'win32' ? '.exe' : '';
const ffmpeg = join(directory, `ffmpeg-${arch}${suffix}`);
const ytdlp = join(directory, `yt-dlp-${arch}${suffix}`);
for (const path of [ffmpeg, ytdlp]) {
	if (!existsSync(path)) throw new Error(`Installer dependency is missing: ${path}`);
}
const run = (binary, args) => execFileSync(binary, args, { encoding: 'utf8', timeout: 30_000 });
const version = run(ffmpeg, ['-version']);
const encoders = run(ffmpeg, ['-hide_banner', '-encoders']);
const protocols = run(ffmpeg, ['-hide_banner', '-protocols']).replaceAll('\r\n', '\n');
const requiredEncoders = ['libx264', 'libmp3lame', ' aac '];
if (process.platform === 'darwin') requiredEncoders.push('h264_videotoolbox');
for (const encoder of requiredEncoders) {
	if (!encoders.includes(encoder)) throw new Error(`Bundled FFmpeg lacks ${encoder.trim()}`);
}
for (const protocol of ['rtmp', 'rtmps']) {
	if (!protocols.includes(`  ${protocol}\n`)) throw new Error(`Bundled FFmpeg lacks ${protocol}`);
}
if (version.includes('--enable-nonfree')) throw new Error('FFmpeg build cannot be redistributed');
console.log(`FFmpeg: ${version.split('\n')[0]}`);
console.log(`yt-dlp: ${run(ytdlp, ['--version']).trim()}`);
