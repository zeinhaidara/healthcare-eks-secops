FROM python:3.14-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170 AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.14-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin app
COPY --from=builder /install /usr/local
WORKDIR /app
COPY src ./src
COPY static ./static
COPY data ./data
USER 10001:10001
EXPOSE 8080
HEALTHCHECK NONE
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
