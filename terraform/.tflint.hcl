# tflint for this Terraform root (job `tflint` in .github/workflows/security-scans.yml). Report-only in CI.
# The terraform ruleset uses its recommended preset; the AWS ruleset is pinned to a version and verified
# by tflint against the ruleset's signing key when it is installed with `tflint --init`.
plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "aws" {
  enabled = true
  version = "0.49.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}
