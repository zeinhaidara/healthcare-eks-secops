import hashlib
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from src import main

STATIC = Path(__file__).resolve().parent.parent / "static"
JS_TESTS = Path(__file__).resolve().parent / "js"
OWN_JS = sorted(p for p in STATIC.glob("*.js"))
VENDOR = STATIC / "vendor" / "three"

EXPECTED_CSP = (
    "default-src 'none'; script-src 'self'; style-src 'self'; "
    "connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_content_security_policy_is_unchanged():
    assert main.CSP == EXPECTED_CSP


def test_page_has_synthetic_banner_and_key_gate():
    html = read(STATIC / "index.html")
    assert "SYNTHETIC DATA" in html and "not clinical advice" in html
    assert 'id="gate"' in html and 'type="password"' in html
    assert html.index("SYNTHETIC DATA") < html.index('id="gate"')  # banner sits above every view


def test_page_has_no_inline_script_style_or_event_handler_and_no_external_url():
    for name in ("index.html", "app.css", *[p.name for p in OWN_JS]):
        text = read(STATIC / name)
        assert not re.search(r"https?://", text), f"{name} references an external URL"
    html = read(STATIC / "index.html")
    assert not re.search(r"<script(?![^>]*\bsrc=)", html), "inline <script>"
    assert not re.search(r"<style", html), "inline <style>"
    assert not re.search(r"\s(on[a-z]+|style)\s*=", html), "inline handler or style attribute"


def test_page_code_never_uses_storage_cookies_or_the_url_for_state():
    forbidden = re.compile(
        r"localStorage|sessionStorage|document\.cookie|cookieStore|indexedDB|"
        r"history\.(push|replace)State|location\.(search|hash|href\s*=|assign|replace)|"
        r"innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function"
    )
    for path in OWN_JS:
        hits = forbidden.findall(read(path))
        assert not hits, f"{path.name}: {hits}"


def test_only_the_session_module_talks_to_the_api_or_holds_the_key_header():
    for path in OWN_JS:
        text = read(path)
        if path.name == "session.js":
            assert "x-api-key" in text and "/patients" in text
        else:
            assert "x-api-key" not in text, path.name
            assert "/patients" not in text, path.name


def test_vendored_three_matches_its_recorded_version_and_hashes():
    record = read(VENDOR / "VERSION.txt")
    assert "version: 0.186.1" in record and "license: MIT" in record
    for name in ("three.module.js", "three.core.js"):
        digest = hashlib.sha256((VENDOR / name).read_bytes()).hexdigest()
        assert f"{name} sha256: {digest}" in record, f"{name} differs from the recorded copy"
    assert read(VENDOR / "LICENSE").startswith("The MIT License")


def test_patients_routes_return_403_without_a_valid_key(client):
    for path in ("/patients", "/patients/P001"):
        assert client.get(path).status_code == 403
        assert client.get(path, headers={"x-api-key": "wrong"}).status_code == 403
        assert client.get(path, headers={"x-api-key": ""}).status_code == 403


def test_api_sets_no_cookie_and_returns_only_synthetic_records(client, auth):
    r = client.get("/patients", headers=auth)
    assert r.status_code == 200
    assert "set-cookie" not in r.headers
    assert r.headers["cache-control"] == "no-store"
    records = r.json()
    assert len(records) == 30
    assert {x["data_classification"] for x in records} == {"synthetic"}
    assert all(x["risk_band"] and x["status"] and x["conditions"] for x in records)
    assert client.get("/patients/P001", headers=auth).json()["data_classification"] == "synthetic"


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is not installed here")
def test_page_logic_passes_its_node_tests():
    files = sorted(str(p) for p in JS_TESTS.glob("*.test.mjs"))
    assert len(files) == 4, files
    result = subprocess.run(
        ["node", "--test", *files], capture_output=True, text=True, timeout=120, check=False
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_every_static_module_is_served_as_javascript_and_every_import_resolves(client):
    for path in [*OWN_JS, VENDOR / "three.module.js", VENDOR / "three.core.js"]:
        url = "/static/" + path.relative_to(STATIC).as_posix()
        r = client.get(url)
        assert r.status_code == 200, url
        assert "javascript" in r.headers["content-type"], url
        assert "default-src 'none'" in r.headers["content-security-policy"]
    for path in OWN_JS:
        for target in re.findall(r"""(?:from|import\()\s*["'](\./[^"']+)["']""", read(path)):
            assert (path.parent / target).is_file(), f"{path.name} imports missing {target}"
    html = read(STATIC / "index.html")
    assert '<script type="module" src="/static/app.js"></script>' in html


def test_page_has_a_native_card_dialog_a_legend_and_a_status_note():
    html = read(STATIC / "index.html")
    assert '<dialog id="card"' in html and 'aria-labelledby="card-title"' in html
    assert 'id="card-close"' in html and 'aria-label="Close patient card"' in html
    assert 'id="legend"' in html and 'id="status-note"' in html and 'id="node-label"' in html
    assert html.count("SYNTHETIC DATA") == 2  # the page banner and the card banner
    assert 'tabindex="0"' in html  # the tree can take keyboard focus


def test_missing_status_is_never_shown_as_watch():
    layout = read(STATIC / "layout.js")
    app = read(STATIC / "app.js")
    assert '|| "watch"' not in layout and '|| "watch"' not in app
    assert '"unknown"' in layout
