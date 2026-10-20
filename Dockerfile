# SURDHARA public download server (app.py) - used by Render / Railway / Fly.io. The website itself stays on Vercel.
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp needs a JavaScript runtime to read YouTube
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .

ENV SURDHARA_PUBLIC=1 \
    SURDHARA_DIR=/tmp/surdhara \
    PYTHONUNBUFFERED=1

CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 8 --timeout 300"]
