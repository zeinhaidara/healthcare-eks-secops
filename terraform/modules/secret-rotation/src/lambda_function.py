"""Secrets Manager rotation for a single plaintext API key.

Implements the standard four steps. The app reads the key itself at startup, so there is no
external system to update in setSecret. The secret value is never logged.
"""

import logging
import secrets

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

client = boto3.client("secretsmanager")


def lambda_handler(event, context):
    arn = event["SecretId"]
    token = event["ClientRequestToken"]
    step = event["Step"]

    meta = client.describe_secret(SecretId=arn)
    if not meta.get("RotationEnabled"):
        raise ValueError("Rotation is not enabled for this secret")
    stages = meta["VersionIdsToStages"].get(token)
    if stages is None:
        raise ValueError("Version has no stage for rotation")
    if "AWSCURRENT" in stages:
        logger.info("Version already AWSCURRENT, nothing to do")
        return
    if "AWSPENDING" not in stages:
        raise ValueError("Version is not AWSPENDING")

    steps = {
        "createSecret": create_secret,
        "setSecret": set_secret,
        "testSecret": test_secret,
        "finishSecret": finish_secret,
    }
    if step not in steps:
        raise ValueError("Unknown step")
    logger.info("rotation step %s", step)
    steps[step](arn, token)


def create_secret(arn, token):
    try:
        client.get_secret_value(SecretId=arn, VersionId=token, VersionStage="AWSPENDING")
        return  # already created by an earlier attempt
    except ClientError as err:
        if err.response["Error"]["Code"] != "ResourceNotFoundException":
            raise
    client.put_secret_value(
        SecretId=arn,
        ClientRequestToken=token,
        SecretString=secrets.token_urlsafe(32),
        VersionStages=["AWSPENDING"],
    )


def set_secret(arn, token):
    """Nothing external to update: the app fetches the key at startup."""


def test_secret(arn, token):
    value = client.get_secret_value(SecretId=arn, VersionId=token, VersionStage="AWSPENDING")
    if not value.get("SecretString"):
        raise ValueError("Pending secret is empty")


def finish_secret(arn, token):
    meta = client.describe_secret(SecretId=arn)
    current = next(
        (v for v, s in meta["VersionIdsToStages"].items() if "AWSCURRENT" in s), None
    )
    if current == token:
        return
    kwargs = {"SecretId": arn, "VersionStage": "AWSCURRENT", "MoveToVersionId": token}
    if current:
        kwargs["RemoveFromVersionId"] = current
    client.update_secret_version_stage(**kwargs)
