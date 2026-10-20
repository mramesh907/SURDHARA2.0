"""Tests for app.py (the SURDHARA companion server).  Run:  python -m unittest discover -s tests -v

yt-dlp is replaced by a tiny fake, so no internet and no ffmpeg are needed.
"""
import importlib
import os
import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


class FakeYoutubeDL:
    def __init__(self, options):
        self.options = options

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def extract_info(self, url, download=False):
        if 'playlist?list' in url:
            return {'_type': 'playlist', 'entries': []}
        if 'live' in url:
            return {'id': 'LIVELIVELIV', 'title': 'Live', 'is_live': True}
        vid = url.split('v=')[-1][:11]
        return {'id': vid, 'title': 'Song: A/B 100%', 'channel': 'Artist - Topic', 'duration': 12}

    def download(self, urls):
        target = self.options['outtmpl']['default'] % {'ext': 'm4a'}
        for hook in self.options['progress_hooks']:
            hook({'status': 'downloading', 'total_bytes': 10, 'downloaded_bytes': 5})
        Path(target).write_bytes(b'ftypM4A fake audio bytes' * 50)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.mkdtemp(prefix='surdhara-test-')
        os.environ['SURDHARA_DIR'] = cls.folder
        cls.server = importlib.import_module('app')
        cls.server.yt_dlp = type('FakeModule', (), {'YoutubeDL': FakeYoutubeDL, 'version': type('V', (), {'__version__': 'fake'})})
        cls.client = cls.server.app.test_client()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.folder, ignore_errors=True)

    def wait_for(self, job_id):
        for _ in range(100):
            job = self.client.get(f'/api/surdhara/jobs/{job_id}').get_json()['job']
            if job['status'] in {'done', 'error'}:
                return job
            time.sleep(0.05)
        self.fail('job did not finish')

    def test_url_normalising(self):
        n = self.server.normalise_youtube_url
        self.assertEqual(n('https://www.youtube.com/watch?v=abcdefghijk&list=PL1')[0], 'https://www.youtube.com/watch?v=abcdefghijk')
        self.assertEqual(n('abcdefghijk')[0], 'https://www.youtube.com/watch?v=abcdefghijk')
        self.assertEqual(n('youtu.be/abcdefghijk')[0], 'https://youtu.be/abcdefghijk')
        self.assertTrue(n('https://evil.example/watch?v=abcdefghijk')[1])
        self.assertTrue(n('https://youtube.com.evil.example/x')[1])
        self.assertTrue(n('')[1])

    def test_download_list_stream_delete(self):
        response = self.client.post('/api/surdhara/download', json={'url': 'https://www.youtube.com/watch?v=AAAAAAAAAAA'})
        self.assertEqual(response.status_code, 202)
        job = self.wait_for(response.get_json()['job']['id'])
        self.assertEqual(job['status'], 'done', job)
        song = job['song']
        self.assertTrue(song['filename'].endswith('.m4a'))
        self.assertEqual(song['artist'], 'Artist')
        self.assertTrue((Path(self.folder) / song['filename']).is_file())

        songs = self.client.get('/api/surdhara/songs').get_json()['songs']
        self.assertIn(song['filename'], [s['filename'] for s in songs])

        ranged = self.client.get(song['streamUrl'], headers={'Range': 'bytes=0-9'})
        self.assertEqual(ranged.status_code, 206)
        self.assertEqual(len(ranged.data), 10)
        self.assertEqual(ranged.mimetype, 'audio/mp4')

        again = self.client.post('/api/surdhara/download', json={'url': 'AAAAAAAAAAA'})
        self.assertTrue(self.wait_for(again.get_json()['job']['id']).get('alreadyDownloaded'))

        self.assertEqual(self.client.delete(f"/api/surdhara/songs/{song['filename']}").status_code, 200)
        self.assertFalse((Path(self.folder) / song['filename']).exists())
        self.assertEqual(self.client.get(song['streamUrl']).status_code, 404)

    def test_blocking_endpoint(self):
        response = self.client.get('/download/m4a?url=https://www.youtube.com/watch?v=BBBBBBBBBBB')
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body['status'], 'success')
        self.assertTrue(body['saved_to'].startswith(self.folder))

    def test_rejects_playlists_live_and_bad_links(self):
        self.assertEqual(self.client.get('/download/m4a?url=https://www.youtube.com/playlist?list=PL1').status_code, 502)
        self.assertEqual(self.client.get('/download/m4a?url=https://www.youtube.com/watch?v=live').status_code, 502)
        self.assertEqual(self.client.get('/download/m4a?url=https://example.com/a').status_code, 400)

    def test_path_traversal_and_foreign_files_are_blocked(self):
        for name in ('..%2Fapp.py', '%2E%2E%2F%2E%2E%2Fetc%2Fpasswd', '.surdhara-index.json', 'notes.txt'):
            self.assertEqual(self.client.get(f'/api/surdhara/stream/{name}').status_code, 404, name)
        self.assertEqual(self.client.delete('/api/surdhara/songs/..%2Fapp.py').status_code, 404)

    def test_other_websites_cannot_start_downloads(self):
        bad = self.client.post('/api/surdhara/download', json={'url': 'AAAAAAAAAAA'}, headers={'Origin': 'https://evil.example'})
        self.assertEqual(bad.status_code, 403)
        cross = self.client.get('/download/m4a?url=AAAAAAAAAAA', headers={'Sec-Fetch-Site': 'cross-site'})
        self.assertEqual(cross.status_code, 403)
        ok = self.client.options('/api/surdhara/download', headers={'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'POST'})
        self.assertEqual(ok.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173')

    def test_songs_added_by_hand_are_listed(self):
        (Path(self.folder) / 'Hand Added.m4a').write_bytes(b'x' * 100)
        titles = [s['title'] for s in self.client.get('/api/surdhara/songs').get_json()['songs']]
        self.assertIn('Hand Added', titles)


if __name__ == '__main__':
    unittest.main()
