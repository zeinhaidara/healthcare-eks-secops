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

output "sns_topic_arn" {
  value = aws_sns_topic.trail.arn
}

output "trail_log_group_name" {
  value = aws_cloudwatch_log_group.trail.name
}

output "access_log_bucket_name" {
  value = aws_s3_bucket.access_logs.id
}
