output "api_url" {
  description = "Direct API Gateway URL. The raw event route requires SigV4 authorization."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "demo_url" {
  description = "CloudFront URL for the RelayBench demo."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "event_bus_name" {
  description = "RelayBench custom EventBridge bus name."
  value       = aws_cloudwatch_event_bus.main.name
}

output "delivery_dlq_url" {
  description = "Queue URL used to inspect exhausted deliveries."
  value       = aws_sqs_queue.delivery_dlq.url
}
