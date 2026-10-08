import asyncio
import hmac
import json
import logging
import sys
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings, fetch_api_key, load_settings
from .models import Patient, PatientCreate
from .store import DynamoStore, MemoryStore, seed_if_empty

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
CSP = (
    "default-src 'none'; script-src 'self'; style-src 'self'; "
    "connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
)

log = logging.getLogger("api")
request_count: dict[tuple[str, str, int], int] = defaultdict(int)
latency_sum: dict[tuple[str, str], float] = defaultdict(float)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {"timestamp": self.formatTime(record), "level": record.levelname}
        entry.update(getattr(record, "fields", {"message": record.getMessage()}))
        return json.dumps(entry)


def setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    log.handlers[:] = [handler]
    log.setLevel(logging.INFO)
    log.propagate = False


async def load_api_key(app: FastAPI, settings: Settings) -> None:
    """Fetch the key, retrying with backoff. The pod stays not-ready until it succeeds."""
    delay = 1
    while True:
        try:
            app.state.api_key = await asyncio.to_thread(fetch_api_key, settings)
        except (BotoCoreError, ClientError, KeyError) as exc:  # log the type only, never the secret
            log.warning("api key fetch failed", extra={"fields": {"error": type(exc).__name__}})
        if app.state.api_key or not settings.api_key_secret_name:
            return
        await asyncio.sleep(delay)
        delay = min(delay * 2, 30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    settings = load_settings()
    app.state.api_key = settings.api_key  # set only for local/tests; AWS fetches below
    if settings.dynamodb_table:
        store = DynamoStore.from_env(settings.dynamodb_table, settings.aws_region)
    else:
        store = MemoryStore()
    seed_if_empty(store, settings.seed_file)
    app.state.store = store
    task = None if app.state.api_key else asyncio.create_task(load_api_key(app, settings))
    yield
    if task:
        task.cancel()


app = FastAPI(title="healthcare-api", lifespan=lifespan, docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def observe(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    route = request.scope.get("route")
    template = route.path if route else "unmatched"
    request_count[(request.method, template, response.status_code)] += 1
    latency_sum[(request.method, template)] += elapsed
    response.headers["x-request-id"] = request_id
    response.headers["content-security-policy"] = CSP
    response.headers["x-content-type-options"] = "nosniff"
    response.headers["cache-control"] = "no-store"
    # Only request metadata is logged, never patient fields.
    log.info(
        "request",
        extra={
            "fields": {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "latency_ms": round(elapsed * 1000, 2),
            }
        },
    )
    return response


def require_key(request: Request, x_api_key: str | None = Header(default=None)) -> None:
    expected = request.app.state.api_key
    if (
        not expected
        or not x_api_key
        or not hmac.compare_digest(x_api_key.encode(), expected.encode())
    ):
        raise HTTPException(status_code=403, detail="Forbidden")


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health() -> dict:
    return {"status": "healthy"}


@app.get("/ready")
def ready(request: Request, response: Response) -> dict:
    if not request.app.state.api_key:
        response.status_code = 503
        return {"status": "not ready"}
    return {"status": "ready"}


@app.get("/metrics", response_class=PlainTextResponse)
def metrics() -> str:
    lines = ["# TYPE http_requests_total counter"]
    for (method, path, status), n in sorted(request_count.items()):
        lines.append(
            f'http_requests_total{{method="{method}",path="{path}",status="{status}"}} {n}'
        )
    lines.append("# TYPE http_request_duration_seconds_sum counter")
    for (method, path), total in sorted(latency_sum.items()):
        lines.append(
            f'http_request_duration_seconds_sum{{method="{method}",path="{path}"}} {total:.6f}'
        )
    return "\n".join(lines) + "\n"


@app.get("/patients", dependencies=[Depends(require_key)])
def list_patients(request: Request) -> list[Patient]:
    return request.app.state.store.list()


@app.get("/patients/{patient_id}", dependencies=[Depends(require_key)])
def get_patient(patient_id: str, request: Request) -> Patient:
    patient = request.app.state.store.get(patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@app.post("/patients", status_code=201, dependencies=[Depends(require_key)])
def create_patient(data: PatientCreate, request: Request) -> Patient:
    patient = Patient.new(data)
    request.app.state.store.put(patient)
    return patient


@app.delete("/patients/{patient_id}", status_code=204, dependencies=[Depends(require_key)])
def delete_patient(patient_id: str, request: Request) -> Response:
    if not request.app.state.store.delete(patient_id):
        raise HTTPException(status_code=404, detail="Patient not found")
    return Response(status_code=204)
