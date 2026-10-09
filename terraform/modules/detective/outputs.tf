output "trail_bucket_name" {
  value = aws_s3_bucket.trail.id
}

output "trail_arn" {
  value = aws_cloudtrail.this.arn
}

output "guardduty_detector_id" {
  value = aws_guardduty_detector.this.id
}

output "securityhub_standards_arn" {
  value = aws_securityhub_standards_subscription.fsbp.standards_arn
}
