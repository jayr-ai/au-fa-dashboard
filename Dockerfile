FROM python:3.12-alpine
WORKDIR /app

# Everything the page needs. data.json is baked into the image, so a redeploy is
# what refreshes the numbers unless the GitHub-commit path in the sync script is used.
# Cache buster: rebuild to pick up July 29 perfect state data (2026-07-31 16:00)
COPY index.html data.json serve.py robots.txt ./
COPY assets ./assets

# Must bind all interfaces inside the container - loopback would be unreachable and
# the healthcheck would fail with nothing obvious in the logs.
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["sh","-c","python serve.py ${PORT:-8080}"]
