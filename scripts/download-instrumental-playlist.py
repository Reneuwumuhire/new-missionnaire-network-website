"""Download the public Hymns on Piano playlist entries as MP3s for import.

Requires yt-dlp and ffmpeg. Run from the repository root, then run
`node --env-file=admin/.env.local scripts/import-instrumental-playlist.mjs --write`.
"""

import argparse
import concurrent.futures
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MANIFEST = Path(__file__).resolve().parent / "data/hymns-on-piano-playlist.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--yt-dlp", default="yt-dlp", help="Path to a current yt-dlp executable")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    if args.workers < 1:
        parser.error("--workers must be positive")

    output_dir = ROOT / ".song-archive/instrumental-playlist"
    output_dir.mkdir(parents=True, exist_ok=True)
    entries = [entry for entry in json.loads(MANIFEST.read_text()) if entry["privacyStatus"] == "public"]

    def download(entry):
        video_id = entry["id"]
        target = output_dir / f"{video_id}.mp3"
        info = output_dir / f"{video_id}.info.json"
        if target.exists() and target.stat().st_size > 0 and info.exists():
            return video_id, True, "already downloaded"

        base_command = [
            args.yt_dlp,
            "--ignore-config",
            "--no-playlist",
            "--js-runtimes", "node",
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "5",
            "--write-info-json",
            "--no-progress",
            "--output", str(output_dir / "%(id)s.%(ext)s"),
        ]
        last_error = ""
        for audio_format in ("bestaudio", "140"):
            result = subprocess.run(
                [*base_command, "--format", audio_format, f"https://www.youtube.com/watch?v={video_id}"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0 and target.exists() and target.stat().st_size > 0:
                return video_id, True, "downloaded"
            last_error = (result.stderr or result.stdout)[-500:].strip()
        return video_id, False, last_error

    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        for completed, result in enumerate(executor.map(download, entries), 1):
            video_id, ok, message = result
            if not ok:
                failures.append(video_id)
                print(f"FAILED {video_id}: {message}", flush=True)
            elif completed % 25 == 0 or completed == len(entries):
                print(f"{completed}/{len(entries)} processed", flush=True)

    if failures:
        raise SystemExit(f"{len(failures)} recordings failed: {', '.join(failures)}")
    print(f"All {len(entries)} public recordings downloaded")


if __name__ == "__main__":
    main()
