# Runbook: API key rotation

Secret: `cloudbatch818-zein-hcsecops-api-key` (Secrets Manager, KMS-encrypted, plaintext string).
Rotation Lambda: `cloudbatch818-zein-hcsecops-rotate-api-key`, every 30 days. It generates a new value with `secrets.token_urlsafe(32)`, never logs it, and moves it to `AWSCURRENT`.

## What you must know

- **The app reads the key once, at startup.** After a rotation the running pods still hold the old key and will start returning 403 to clients that use the new one. Restart the pods after every rotation.
- The first scheduled rotation runs 30 days after the secret is created. You set the first value by hand before then (see `docs/bootstrap.md`).
- The secret has a recovery window of 0 days. **Destroying the stack deletes the secret and the key immediately.** After the next apply, set a new value in the console again. Save it in your password manager for testing.

## After a rotation

1. Read the new value: Secrets Manager console, the secret, Retrieve secret value.
2. Restart the pods in each namespace:
   ```sh
   kubectl rollout restart deployment/healthcare-api -n cloudbatch818-healthcare-dev
   kubectl rollout restart deployment/healthcare-api -n cloudbatch818-healthcare-prod
   ```
3. Check `/ready` returns 200 and `/patients` works with the new key.

## If a rotation fails

- Failed invocations land in the SQS dead-letter queue `cloudbatch818-zein-hcsecops-rotate-api-key-dlq`.
- Logs: CloudWatch group `/aws/lambda/cloudbatch818-zein-hcsecops-rotate-api-key` (365-day retention). Logs contain step names only, never the value.
- The previous value stays `AWSCURRENT` until `finishSecret` succeeds, so the app keeps working.
- To force a rotation: console, the secret, Rotation, Rotate secret immediately.
