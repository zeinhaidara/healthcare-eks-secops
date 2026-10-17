# Runbook: rotate the Argo CD GitHub App key

Argo CD reads this repo as a GitHub App. The private key lives only in the Secrets Manager secret that External Secrets syncs into the `argocd` namespace (see `docs/runbooks/argocd-bootstrap.md`). Rotate it every 90 days, or immediately after a suspected leak. The App ID and installation ID do not change.

1. In GitHub, open the App settings and generate a **second** private key. Keep the old key until step 6. Download the new key file to a private location on your machine.
2. In Secrets Manager, update the secret's `githubAppPrivateKey` value with the new key, keeping the other two JSON keys as they are. Do not paste the key into a terminal history, ticket, chat or file in this repo.
3. Wait for the next refresh (up to one hour), or force a sync now: `kubectl -n argocd annotate externalsecret healthcare-repo force-sync=$(date +%s) --overwrite`.
4. Check `kubectl -n argocd get externalsecret healthcare-repo` shows SecretSynced with a new refresh time. Do not print the Secret's data.
5. Confirm Argo can read Git: in the Argo CD UI (`https://argocd.<domain>`, sign in with GitHub), Settings, Repositories shows the repo as Successful, and an Application refresh succeeds.
6. Only then, delete the old private key from the App settings in GitHub, and delete the local key file.

If step 5 fails, the old key is still valid. Put the old value back in Secrets Manager, force a sync, and check again before retrying.
