"""Unit tests for the rotation Lambda. boto3 is replaced by an in-memory fake; no AWS calls."""

import importlib.util
import logging
from pathlib import Path
from unittest import mock

import pytest
from botocore.exceptions import ClientError

SRC = Path(__file__).resolve().parents[1] / "src" / "lambda_function.py"
ARN = "arn:aws:secretsmanager:us-east-2:123456789012:secret:test"
OLD_VALUE = "old-value-do-not-log"


class FakeSecrets:
    """Just enough of the Secrets Manager client: versions with stages and values."""

    def __init__(self, rotation_enabled=True):
        self.rotation_enabled = rotation_enabled
        self.versions = {"v-current": {"stages": {"AWSCURRENT"}, "value": OLD_VALUE}}

    def describe_secret(self, SecretId):
        return {
            "RotationEnabled": self.rotation_enabled,
            "VersionIdsToStages": {v: sorted(d["stages"]) for v, d in self.versions.items()},
        }

    def get_secret_value(self, SecretId, VersionId=None, VersionStage=None):
        data = self.versions.get(VersionId)
        if (
            data is None
            or data["value"] is None
            or (VersionStage and VersionStage not in data["stages"])
        ):
            raise ClientError({"Error": {"Code": "ResourceNotFoundException"}}, "GetSecretValue")
        return {"SecretString": data["value"]}

    def put_secret_value(self, SecretId, ClientRequestToken, SecretString, VersionStages):
        self.versions[ClientRequestToken] = {"stages": set(VersionStages), "value": SecretString}

    def update_secret_version_stage(
        self, SecretId, VersionStage, MoveToVersionId, RemoveFromVersionId=None
    ):
        if RemoveFromVersionId:
            self.versions[RemoveFromVersionId]["stages"].discard(VersionStage)
        self.versions[MoveToVersionId]["stages"].add(VersionStage)
        self.versions[MoveToVersionId]["stages"].discard("AWSPENDING")


@pytest.fixture
def lf():
    fake = FakeSecrets()
    with mock.patch("boto3.client", return_value=fake):
        spec = importlib.util.spec_from_file_location("lambda_function", SRC)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module, fake


def event(step, token="v-new"):
    return {"SecretId": ARN, "ClientRequestToken": token, "Step": step}


def mark_pending(fake, token="v-new", value=None):
    fake.versions[token] = {"stages": {"AWSPENDING"}, "value": value}


def test_full_rotation_makes_new_value_current(lf):
    module, fake = lf
    mark_pending(
        fake
    )  # Secrets Manager stages the new version, without a value, before the first step
    for step in ("createSecret", "setSecret", "testSecret", "finishSecret"):
        module.lambda_handler(event(step), None)
    assert fake.versions["v-new"]["stages"] == {"AWSCURRENT"}
    assert "AWSCURRENT" not in fake.versions["v-current"]["stages"]
    assert fake.versions["v-new"]["value"] not in (None, "", OLD_VALUE)
    assert len(fake.versions["v-new"]["value"]) >= 32


def test_rotation_not_enabled_is_rejected(lf):
    module, fake = lf
    fake.rotation_enabled = False
    with pytest.raises(ValueError, match="not enabled"):
        module.lambda_handler(event("createSecret"), None)


def test_unknown_version_is_rejected(lf):
    module, _ = lf
    with pytest.raises(ValueError, match="no stage"):
        module.lambda_handler(event("createSecret", token="missing"), None)


def test_already_current_version_does_nothing(lf):
    module, fake = lf
    module.lambda_handler(event("createSecret", token="v-current"), None)
    assert fake.versions["v-current"]["value"] == OLD_VALUE


def test_version_must_be_pending(lf):
    module, fake = lf
    fake.versions["v-new"] = {"stages": {"SOMETHINGELSE"}, "value": "x"}
    with pytest.raises(ValueError, match="not AWSPENDING"):
        module.lambda_handler(event("createSecret"), None)


def test_unknown_step_is_rejected(lf):
    module, fake = lf
    mark_pending(fake)
    with pytest.raises(ValueError, match="Unknown step"):
        module.lambda_handler(event("bogus"), None)


def test_create_secret_is_idempotent(lf):
    module, fake = lf
    mark_pending(fake, value="already-created")
    module.create_secret(ARN, "v-new")
    assert fake.versions["v-new"]["value"] == "already-created"


def test_create_secret_reraises_unexpected_errors(lf):
    module, fake = lf

    def denied(**_):
        raise ClientError({"Error": {"Code": "AccessDeniedException"}}, "GetSecretValue")

    fake.get_secret_value = denied
    with pytest.raises(ClientError):
        module.create_secret(ARN, "v-new")


def test_test_secret_rejects_empty_pending_value(lf):
    module, fake = lf
    mark_pending(fake, value="")
    with pytest.raises(ValueError, match="empty"):
        module.test_secret(ARN, "v-new")


def test_finish_secret_is_idempotent(lf):
    module, fake = lf
    fake.versions["v-new"] = {"stages": {"AWSCURRENT"}, "value": "n"}
    fake.versions["v-current"]["stages"] = set()
    module.finish_secret(ARN, "v-new")
    assert fake.versions["v-new"]["stages"] == {"AWSCURRENT"}


def test_finish_secret_without_existing_current(lf):
    module, fake = lf
    fake.versions["v-current"]["stages"] = set()
    mark_pending(fake, value="n")
    module.finish_secret(ARN, "v-new")
    assert "AWSCURRENT" in fake.versions["v-new"]["stages"]


def test_secret_values_are_never_logged(lf, caplog):
    module, fake = lf
    mark_pending(fake)
    with caplog.at_level(logging.DEBUG):
        for step in ("createSecret", "setSecret", "testSecret", "finishSecret"):
            module.lambda_handler(event(step), None)
    text = caplog.text
    assert OLD_VALUE not in text
    assert fake.versions["v-new"]["value"] not in text


def test_client_has_explicit_timeouts():
    with mock.patch("boto3.client") as client:
        spec = importlib.util.spec_from_file_location("lambda_function", SRC)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    config = client.call_args.kwargs["config"]
    assert config.connect_timeout == 3
    assert config.read_timeout == 5
    assert module.client is client.return_value
