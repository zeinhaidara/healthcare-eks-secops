output "certificate_arn" {
  description = "Validated certificate ARN, for the ALB ingress."
  value       = aws_acm_certificate_validation.this.certificate_arn
}
