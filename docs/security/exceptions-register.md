# Exceptions register

Every suppression (`checkov:skip`, `.trivyignore`, Prowler mutelist) needs an inline reason, owner and expiry in the code, plus a row here. Never skip a whole check ID without a reason.

| ID | Tool and rule | Resource | Reason | Owner | Expiry | Link |
|---|---|---|---|---|---|---|
| EXC-001 | Checkov 3.3.26 `CKV_AWS_109`, `CKV_AWS_111`, `CKV_AWS_356` | `module.kms` key policy (`terraform/modules/kms/main.tf`) | Account-root `kms:*` statement is required in every KMS key policy or the key becomes unmanageable; `*` as resource in a key policy means this key only. Checkov cannot tell it from an over-permissive IAM policy. | Moulaye | 2027-04-08 | SEC-005 |
| EXC-002 | Checkov 3.3.26 `CKV_AWS_272` | `module.secret_rotation` Lambda (`terraform/modules/secret-rotation/main.tf`) | Code signing needs AWS Signer (profile plus signing step before deploy), a pipeline change outside Phase 2. Planned for Phase 7. Source is reviewed in this repo and packaged by Terraform. | Moulaye | 2027-04-08 | SEC-006 |
