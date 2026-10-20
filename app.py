"""
SURDHARA companion server  (YouTube -> M4A downloader + "My Downloads" library)

Run it on the same computer you use SURDHARA on:

    pip install -r requirements.txt
    python app.py

What it does
  * Downloads the audio of a YouTube video as .m4a into  <your Downloads folder>/Surdhara
  * Lists / streams / deletes the songs that are inside that folder, so the SURDHARA website
    can show them in its "YouTube Downloads" section.
  * If you have run `npm run build`, it also serves the finished website, so
    http://localhost:5000 is the whole app (no second server needed).

Dedicated download endpoint (paste a link, get an .m4a):

    GET  http://localhost:5000/download/m4a?url=<youtube link>      (waits until the file is saved)
    POST http://localhost:5000/api/surdhara/download  {"url": "..."}  (returns a job id; poll /api/surdhara/jobs/<id>)

Settings (environment variables, all optional)
    SURDHARA_DIR                  folder for the songs (default: <Downloads>/Surdhara)
    SURDHARA_HOST / SURDHARA_PORT bind address / port   (default 127.0.0.1 : 5000)
    SURDHARA_ALLOWED_ORIGINS      extra website origins allowed to call this server, comma separated
                                  (localhost / 127.0.0.1 on any port are always allowed)
    SURDHARA_COOKIES_FROM_BROWSER e.g. "chrome" or "firefox" - lets yt-dlp reuse your browser login
                                  when YouTube answers "Sign in to confirm you're not a bot"
    SURDHARA_COOKIES_FILE         path to a cookies.txt file (alternative to the line above)

Only download audio you have the right to keep. YouTube's terms restrict downloading content
that is not yours or not offered for download.
"""
from __future__ import annotations

import ctypes
import hashlib
import json
import mimetypes
import os
import re
import shutil
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

from flask import Flask, abort, jsonify, request, send_file, send_from_directory

try:  # The server still starts (and can play existing songs) without yt-dlp.
    import yt_dlp
    from yt_dlp.utils import sanitize_filename
except Exception as _import_error:  # pragma: no cover - depends on the user's machine
    yt_dlp = None
    _YTDLP_IMPORT_ERROR = str(_import_error)

    def sanitize_filename(name, restricted=False):  # minimal fallback, only used for display names
        return re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name).strip()
else:
    _YTDLP_IMPORT_ERROR = ''

APP_VERSION = '1.0.0'
AUDIO_EXTENSIONS = {'.m4a', '.mp3', '.aac', '.ogg', '.opus', '.wav', '.flac'}
MIME_OVERRIDES = {'.m4a': 'audio/mp4', '.aac': 'audio/aac', '.opus': 'audio/ogg', '.flac': 'audio/flac'}
INDEX_NAME = '.surdhara-index.json'
MAX_CONCURRENT_DOWNLOADS = 2
JOB_TTL_SECONDS = 3600
YOUTUBE_HOSTS = {'youtube.com', 'youtu.be', 'youtube-nocookie.com'}


# --------------------------------------------------------------------------------------
# Where the songs live:  <user's Downloads folder>/Surdhara
# --------------------------------------------------------------------------------------
def default_downloads_dir() -> Path:
    """The user's real Downloads folder (handles moved/localised folders on Windows and Linux)."""
    try:
        if sys.platform.startswith('win'):
            from ctypes import wintypes

            class GUID(ctypes.Structure):
                _fields_ = [('a', wintypes.DWORD), ('b', wintypes.WORD), ('c', wintypes.WORD), ('d', ctypes.c_ubyte * 8)]

            guid = GUID(0x374DE290, 0x123F, 0x4565, (ctypes.c_ubyte * 8)(0x91, 0x64, 0x39, 0xC4, 0x92, 0x5E, 0x46, 0x7B))
            buffer = ctypes.c_wchar_p()
            if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(guid), 0, None, ctypes.byref(buffer)) == 0:
                path = Path(buffer.value)
                ctypes.windll.ole32.CoTaskMemFree(buffer)
                return path
        elif sys.platform.startswith('linux'):
            config = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config')) / 'user-dirs.dirs'
            if config.is_file():
                match = re.search(r'^XDG_DOWNLOAD_DIR="?([^"\n]+)"?', config.read_text(errors='ignore'), re.M)
                if match:
                    return Path(os.path.expandvars(match.group(1).replace('$HOME', str(Path.home()))))
    except Exception:
        pass
    return Path.home() / 'Downloads'


SONGS_DIR = Path(os.environ.get('SURDHARA_DIR') or (default_downloads_dir() / 'Surdhara')).expanduser()
SONGS_DIR.mkdir(parents=True, exist_ok=True)
SONGS_DIR = SONGS_DIR.resolve()
DIST_DIR = Path(__file__).resolve().parent / 'dist'

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


# --------------------------------------------------------------------------------------
# Browser access (CORS) - only SURDHARA running on this computer, plus any origin you list
# --------------------------------------------------------------------------------------
_LOCAL_ORIGIN = re.compile(r'^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$')
_EXTRA_ORIGINS = {
    'http://192.168.1.5:5173',
    *(
        o.strip().rstrip('/')
        for o in os.environ.get('SURDHARA_ALLOWED_ORIGINS', '').split(',')
        if o.strip()
    ),
}


def origin_allowed(origin: str | None) -> bool:
    return bool(origin) and (bool(_LOCAL_ORIGIN.match(origin)) or origin.rstrip('/') in _EXTRA_ORIGINS)


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if origin_allowed(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Range'
        response.headers['Access-Control-Expose-Headers'] = 'Content-Length, Content-Range, Accept-Ranges'
        # Lets an https website talk to this server on your own computer (Chrome "Private Network Access").
        response.headers['Access-Control-Allow-Private-Network'] = 'true'
        response.headers['Access-Control-Max-Age'] = '600'
        response.vary.add('Origin')
    return response


@app.before_request
def guard_state_changing_requests():
    """Stop other websites from silently starting downloads / deleting songs through your browser."""
    if request.method == 'OPTIONS':
        return None
    changes_things = request.method in {'POST', 'DELETE'} or request.path == '/download/m4a'
    if not changes_things:
        return None
    origin = request.headers.get('Origin')
    if origin and not origin_allowed(origin) and origin.rstrip('/') != request.host_url.rstrip('/'):
        return jsonify({'status': 'error', 'message': 'This website is not allowed to use the SURDHARA server.'}), 403
    if not origin and request.headers.get('Sec-Fetch-Site') == 'cross-site':
        return jsonify({'status': 'error', 'message': 'Cross-site request blocked.'}), 403
    return None


# --------------------------------------------------------------------------------------
# Song index (title / artist / cover for songs downloaded by SURDHARA) + folder scanning
# --------------------------------------------------------------------------------------
_index_lock = threading.RLock()


def read_index() -> dict:
    with _index_lock:
        try:
            data = json.loads((SONGS_DIR / INDEX_NAME).read_text(encoding='utf-8'))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}


def write_index(index: dict) -> None:
    with _index_lock:
        target = SONGS_DIR / INDEX_NAME
        temp = target.with_suffix('.tmp')
        temp.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding='utf-8')
        os.replace(temp, target)


def clean_artist(name: str | None) -> str:
    return re.sub(r'\s*-\s*Topic$', '', (name or '').strip(), flags=re.I)


def safe_song_path(filename: str) -> Path | None:
    """Resolve a file name from the browser to a real file directly inside the Surdhara folder, else None."""
    if not filename or filename != os.path.basename(filename) or filename.startswith('.'):
        return None
    path = (SONGS_DIR / filename)
    if path.suffix.lower() not in AUDIO_EXTENSIONS:
        return None
    try:
        resolved = path.resolve()
    except OSError:
        return None
    if resolved.parent != SONGS_DIR or not resolved.is_file():
        return None
    return resolved


def song_record(path: Path, index: dict) -> dict:
    meta = index.get(path.name, {})
    stat = path.stat()
    video_id = meta.get('videoId') or ''
    return {
        'id': video_id or 'file-' + hashlib.sha1(path.name.encode('utf-8')).hexdigest()[:12],
        'filename': path.name,
        'title': meta.get('title') or path.stem,
        'artist': clean_artist(meta.get('artist')),
        'videoId': video_id,
        'sourceUrl': meta.get('sourceUrl') or (f'https://www.youtube.com/watch?v={video_id}' if video_id else ''),
        'thumbnail': meta.get('thumbnail') or '',
        'duration': meta.get('duration') or 0,
        'size': stat.st_size,
        'extension': path.suffix.lower().lstrip('.'),
        'addedAt': meta.get('addedAt') or datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        'streamUrl': f'/api/surdhara/stream/{quote(path.name)}',
    }


def list_songs() -> list[dict]:
    index = read_index()
    songs = []
    for entry in SONGS_DIR.iterdir():
        if entry.is_file() and not entry.name.startswith('.') and entry.suffix.lower() in AUDIO_EXTENSIONS:
            try:
                songs.append(song_record(entry, index))
            except OSError:
                continue
    songs.sort(key=lambda song: song['addedAt'], reverse=True)
    return songs


# --------------------------------------------------------------------------------------
# URL handling
# --------------------------------------------------------------------------------------
def normalise_youtube_url(raw: str) -> tuple[str | None, str]:
    """Return (clean_url, error). Accepts full links, links without https://, and bare 11-char video ids."""
    text = (raw or '').strip()
    if not text:
        return None, 'Paste a YouTube video link.'
    if re.fullmatch(r'[\w-]{11}', text):
        return f'https://www.youtube.com/watch?v={text}', ''
    if not re.match(r'^[a-z][a-z0-9+.-]*://', text, re.I):
        text = 'https://' + text
    parsed = urlparse(text)
    host = (parsed.hostname or '').lower()
    if parsed.scheme not in {'http', 'https'} or not any(host == h or host.endswith('.' + h) for h in YOUTUBE_HOSTS):
        return None, 'That is not a YouTube link. Paste a link from youtube.com or youtu.be.'
    # A "watch?v=ID&list=..." link means "this video" - keep only the video.
    if host.endswith('youtube.com') and parsed.path == '/watch' and 'v' in parse_qs(parsed.query):
        return f"https://www.youtube.com/watch?v={parse_qs(parsed.query)['v'][0]}", ''
    return text, ''


# --------------------------------------------------------------------------------------
# Download jobs
# --------------------------------------------------------------------------------------
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_download_slots = threading.BoundedSemaphore(MAX_CONCURRENT_DOWNLOADS)


class DownloadError(Exception):
    pass


def ffmpeg_available() -> bool:
    return shutil.which('ffmpeg') is not None


def friendly_error(error: Exception) -> str:
    text = re.sub(r'\x1b\[[0-9;]*m', '', str(error)).replace('ERROR: ', '').strip()
    lowered = text.lower()
    if 'sign in to confirm' in lowered or 'not a bot' in lowered:
        return ('YouTube asked for a sign-in check. Set SURDHARA_COOKIES_FROM_BROWSER=chrome (or firefox) '
                'before starting the server, then try again.')
    if 'private video' in lowered or 'members-only' in lowered or ('sign in' in lowered and 'age' in lowered):
        return 'This video is private, age-restricted or members-only, so it cannot be downloaded.'
    if 'video unavailable' in lowered or 'has been removed' in lowered or 'not available' in lowered:
        return 'This video is unavailable (removed, blocked in your country, or the link is wrong).'
    if 'ffmpeg' in lowered or 'ffprobe' in lowered:
        return 'ffmpeg is required to convert this video to M4A. Install ffmpeg and restart the server.'
    if 'unable to download' in lowered or 'urlopen error' in lowered or 'timed out' in lowered:
        return 'Could not reach YouTube. Check your internet connection and try again.'
    return text[:300] or 'The download failed.'


def new_job(url: str) -> dict:
    now = time.time()
    job = {
        'id': uuid.uuid4().hex[:12], 'url': url, 'status': 'queued', 'progress': 0, 'title': '',
        'videoId': '', 'message': 'Waiting to start…', 'song': None, 'createdAt': now, 'updatedAt': now,
    }
    with _jobs_lock:
        for key in [k for k, v in _jobs.items() if now - v['updatedAt'] > JOB_TTL_SECONDS and v['status'] in {'done', 'error'}]:
            _jobs.pop(key, None)
        _jobs[job['id']] = job
    return job


def update_job(job: dict, **changes) -> None:
    with _jobs_lock:
        job.update(changes)
        job['updatedAt'] = time.time()


def public_job(job: dict) -> dict:
    with _jobs_lock:
        return dict(job)


def ydl_base_options() -> dict:
    options = {'quiet': True, 'no_warnings': True, 'noprogress': True, 'noplaylist': True, 'socket_timeout': 30, 'retries': 3}
    browser = os.environ.get('SURDHARA_COOKIES_FROM_BROWSER', '').strip()
    cookie_file = os.environ.get('SURDHARA_COOKIES_FILE', '').strip()
    if browser:
        options['cookiesfrombrowser'] = (browser,)
    elif cookie_file:
        options['cookiefile'] = cookie_file
    # Recent yt-dlp versions need a JavaScript runtime to read YouTube; use Node if Deno is not installed.
    if not shutil.which('deno') and shutil.which('node'):
        options['js_runtimes'] = {'node': {}}
    return options


def choose_file_stem(title: str, video_id: str, index: dict) -> str:
    """A clean 'Title' file name; only adds [video id] if a different song already uses that name."""
    base = sanitize_filename(title or video_id, restricted=False).strip(' .')[:120] or video_id
    for candidate in (base, f'{base} [{video_id}]'):
        existing = SONGS_DIR / f'{candidate}.m4a'
        if not existing.exists() or index.get(existing.name, {}).get('videoId') == video_id:
            return candidate
    return f'{base} [{video_id}]'


def find_existing(video_id: str, index: dict) -> Path | None:
    for name, meta in index.items():
        if meta.get('videoId') == video_id:
            path = SONGS_DIR / name
            if path.is_file():
                return path
    return None


def run_download(job: dict) -> None:
    """Does the actual work for one link. Runs in a worker thread (or inline for /download/m4a)."""
    temp_dir = SONGS_DIR / f'.tmp-{job["id"]}'
    try:
        if yt_dlp is None:
            raise DownloadError('yt-dlp is not installed on the server. Run:  pip install -r requirements.txt  and restart.')
        update_job(job, status='fetching', message='Reading video details…', progress=2)
        with yt_dlp.YoutubeDL({**ydl_base_options(), 'skip_download': True}) as ydl:
            info = ydl.extract_info(job['url'], download=False)
        if not info:
            raise DownloadError('Could not read this video.')
        if info.get('_type') == 'playlist' or info.get('entries') is not None:
            raise DownloadError('That is a playlist link. Open one video and paste its link instead.')
        if info.get('is_live') or info.get('live_status') in {'is_live', 'is_upcoming'}:
            raise DownloadError('Live streams and premieres cannot be downloaded until they have finished.')

        video_id = info.get('id') or ''
        title = info.get('title') or video_id
        artist = clean_artist(info.get('artist') or info.get('creator') or info.get('channel') or info.get('uploader'))
        update_job(job, title=title, videoId=video_id)

        index = read_index()
        existing = find_existing(video_id, index)
        if existing:
            update_job(job, status='done', progress=100, message='Already in your Surdhara folder.',
                       song=song_record(existing, index), alreadyDownloaded=True)
            return

        stem = choose_file_stem(title, video_id, index)
        final_path = SONGS_DIR / f'{stem}.m4a'
        temp_dir.mkdir(parents=True, exist_ok=True)
        has_ffmpeg = ffmpeg_available()

        def on_progress(data):
            if data.get('status') == 'downloading':
                total = data.get('total_bytes') or data.get('total_bytes_estimate') or 0
                done = data.get('downloaded_bytes') or 0
                percent = int(min(95, 5 + (done / total) * 90)) if total else job['progress']
                update_job(job, status='downloading', progress=percent, message=f'Downloading… {percent}%')
            elif data.get('status') == 'finished':
                update_job(job, status='processing', progress=96, message='Finishing up…')

        options = {
            **ydl_base_options(),
            # Prefer YouTube's own AAC/M4A audio (no quality loss); fall back to best audio and convert.
            'format': 'ba[ext=m4a]/ba' if has_ffmpeg else 'ba[ext=m4a]',
            'outtmpl': {'default': str(temp_dir / (stem.replace('%', '%%') + '.%(ext)s'))},
            'progress_hooks': [on_progress],
            'overwrites': True,
        }
        if has_ffmpeg:
            options['postprocessors'] = [
                {'key': 'FFmpegExtractAudio', 'preferredcodec': 'm4a'},
                {'key': 'FFmpegMetadata', 'add_metadata': True},
            ]
        update_job(job, status='downloading', progress=5, message='Downloading… 0%')
        with yt_dlp.YoutubeDL(options) as ydl:
            ydl.download([job['url']])

        produced = sorted(temp_dir.glob('*.m4a'), key=lambda p: p.stat().st_mtime, reverse=True)
        if not produced:
            raise DownloadError('YouTube did not offer an M4A audio stream for this video'
                                + ('' if has_ffmpeg else ' (install ffmpeg so it can be converted).'))
        os.replace(produced[0], final_path)

        index = read_index()
        index[final_path.name] = {
            'videoId': video_id, 'title': title, 'artist': artist, 'sourceUrl': info.get('webpage_url') or job['url'],
            'thumbnail': f'https://i.ytimg.com/vi/{video_id}/hqdefault.jpg' if video_id else (info.get('thumbnail') or ''),
            'duration': int(info.get('duration') or 0), 'addedAt': datetime.now(timezone.utc).isoformat(),
        }
        write_index(index)
        update_job(job, status='done', progress=100, message='Saved to Downloads/Surdhara', song=song_record(final_path, index))
    except Exception as error:  # noqa: BLE001 - every failure must become a readable job error
        message = str(error) if isinstance(error, DownloadError) else friendly_error(error)
        update_job(job, status='error', message=message)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def start_job(url: str) -> dict:
    # The same link twice in a row just returns the running job instead of downloading twice.
    with _jobs_lock:
        for existing in _jobs.values():
            if existing['url'] == url and existing['status'] in {'queued', 'fetching', 'downloading', 'processing'}:
                return existing
    job = new_job(url)

    def worker():
        with _download_slots:
            run_download(job)

    threading.Thread(target=worker, name=f'surdhara-dl-{job["id"]}', daemon=True).start()
    return job


# --------------------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------------------
@app.get('/api/surdhara/health')
def health():
    return jsonify({
        'status': 'ok', 'app': 'surdhara-server', 'version': APP_VERSION, 'folder': str(SONGS_DIR),
        'ffmpeg': ffmpeg_available(), 'ytdlp': getattr(getattr(yt_dlp, 'version', None), '__version__', None),
        'ytdlpError': _YTDLP_IMPORT_ERROR or None,
    })


@app.get('/api/surdhara/songs')
def api_list_songs():
    return jsonify({'status': 'success', 'folder': str(SONGS_DIR), 'songs': list_songs()})


@app.get('/api/surdhara/stream/<path:filename>')
def api_stream(filename):
    path = safe_song_path(filename)
    if not path:
        abort(404)
    mimetype = MIME_OVERRIDES.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or 'audio/mpeg'
    # conditional=True gives HTTP Range support, so seeking works in the player.
    return send_file(path, mimetype=mimetype, conditional=True, max_age=0)


@app.delete('/api/surdhara/songs/<path:filename>')
def api_delete(filename):
    path = safe_song_path(filename)
    if not path:
        return jsonify({'status': 'error', 'message': 'Song not found.'}), 404
    try:
        path.unlink()
    except OSError as error:
        return jsonify({'status': 'error', 'message': f'Could not delete the file: {error}'}), 500
    index = read_index()
    if index.pop(path.name, None) is not None:
        write_index(index)
    return jsonify({'status': 'success', 'message': 'Song deleted.'})


@app.post('/api/surdhara/download')
def api_download():
    payload = request.get_json(silent=True) or {}
    url, error = normalise_youtube_url(payload.get('url', ''))
    if error:
        return jsonify({'status': 'error', 'message': error}), 400
    return jsonify({'status': 'success', 'job': public_job(start_job(url))}), 202


@app.get('/api/surdhara/jobs')
def api_jobs():
    with _jobs_lock:
        jobs = sorted(_jobs.values(), key=lambda j: j['createdAt'], reverse=True)[:20]
    return jsonify({'jobs': [public_job(j) for j in jobs]})


@app.get('/api/surdhara/jobs/<job_id>')
def api_job(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        return jsonify({'status': 'error', 'message': 'Unknown download.'}), 404
    return jsonify({'status': 'success', 'job': public_job(job)})


@app.route('/download/m4a', methods=['GET', 'POST'])
def download_m4a():
    """Dedicated endpoint: give it a YouTube link and it saves the song as .m4a in Downloads/Surdhara.

    GET  /download/m4a?url=<link>             waits until the file is saved, then answers with the song details
    GET  /download/m4a?url=<link>&file=1      same, but the browser also receives the .m4a file
    POST /download/m4a  {"url": "<link>"}     same as the first form
    """
    raw = request.args.get('url') or (request.get_json(silent=True) or {}).get('url') or request.form.get('url', '')
    url, error = normalise_youtube_url(raw)
    if error:
        return jsonify({'status': 'error', 'message': error}), 400
    job = new_job(url)
    with _download_slots:
        run_download(job)
    if job['status'] != 'done':
        return jsonify({'status': 'error', 'message': job['message']}), 502
    song = job['song']
    if request.args.get('file') in {'1', 'true', 'yes'}:
        path = safe_song_path(song['filename'])
        if path:
            return send_file(path, mimetype='audio/mp4', as_attachment=True, download_name=path.name)
    return jsonify({
        'status': 'success', 'message': job['message'], 'saved_to': str(SONGS_DIR / song['filename']), 'song': song,
    })


# --------------------------------------------------------------------------------------
# Serve the built website when it exists (after `npm run build`)
# --------------------------------------------------------------------------------------
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def website(path):
    if path.startswith(('api/', 'download/')):
        abort(404)
    if not DIST_DIR.is_dir():
        return jsonify({
            'app': 'surdhara-server', 'message': 'The SURDHARA server is running. Open the website with `npm run dev` '
            '(http://localhost:5173) or run `npm run build` once to let this server host it as well.',
            'folder': str(SONGS_DIR),
        })
    target = (DIST_DIR / path).resolve()
    if path and DIST_DIR in target.parents and target.is_file():
        response = send_from_directory(DIST_DIR, path)
        if path == 'sw.js':
            response.headers['Cache-Control'] = 'no-cache'
        return response
    return send_from_directory(DIST_DIR, 'index.html')


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith(('/api/', '/download/')):
        return jsonify({'status': 'error', 'message': 'Not found.'}), 404
    return 'Not found', 404


if __name__ == '__main__':
    host = os.environ.get('SURDHARA_HOST', '127.0.0.1')
    port = int(os.environ.get('SURDHARA_PORT', '5000'))
    print('=' * 64)
    print(' SURDHARA server')
    print('=' * 64)
    print(f' Songs folder : {SONGS_DIR}')
    print(f' yt-dlp       : {"ready" if yt_dlp else "NOT INSTALLED -> pip install -r requirements.txt"}')
    print(f' ffmpeg       : {"found" if ffmpeg_available() else "not found (only native M4A streams can be saved; install ffmpeg for best results)"}')
    print(f' Website      : {"http://localhost:%d  (built app)" % port if DIST_DIR.is_dir() else "run `npm run dev` -> http://localhost:5173"}')
    print(f' M4A endpoint : http://localhost:{port}/download/m4a?url=<youtube link>')
    print('=' * 64)
    app.run(host=host, port=port, debug=False, threaded=True)
