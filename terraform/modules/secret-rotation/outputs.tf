output "function_arn" {
  description = "Resolves only after Secrets Manager is allowed to invoke the function."
  value       = aws_lambda_function.this.arn

  depends_on = [aws_lambda_permission.secrets_manager]
}

output "dlq_arn" {
  value = aws_sqs_queue.dlq.arn
}
