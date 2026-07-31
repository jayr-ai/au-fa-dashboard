FROM python:3.12-alpine
WORKDIR /app

# July 29 perfect state - rolling back to fully working dashboard
# This ensures we have the correct data structure with STRING tiers (TIER 1, TIER 2, TIER 3)
# not numeric tiers (1, 2, 3). Data contains 1339 funnel, 157 KPI, 666 program records.
COPY index.html data.json serve.py robots.txt ./
COPY assets ./assets

# Must bind all interfaces inside the container - loopback would be unreachable and
# the healthcheck would fail with nothing obvious in the logs.
ENV HOST=0.0.0.0
ENV DATA_SYNCED_AT="2026-07-29 14:56:23.174+00"
EXPOSE 8080
CMD ["sh","-c","python serve.py ${PORT:-8080}"]
