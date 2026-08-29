resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/apigateway/${local.prefix}-api"
  retention_in_days = 14
}

resource "aws_apigatewayv2_api" "api" {
  name          = "${local.prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = false
    allow_headers     = ["content-type", "x-request-id"]
    allow_methods     = ["GET", "POST", "OPTIONS"]
    allow_origins     = concat(["https://relaybench.invalid"], var.allowed_origins)
    max_age           = 300
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  for_each = toset(["scenario", "ingest", "query", "diagnose"])

  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.function[each.value].invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
  timeout_milliseconds   = each.value == "diagnose" ? 25000 : 10000
}

resource "aws_apigatewayv2_route" "route" {
  for_each = local.api_routes

  api_id             = aws_apigatewayv2_api.api.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.lambda[each.value.function].id}"
  authorization_type = each.value.authorization
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      responseLatency  = "$context.responseLatency"
      integrationError = "$context.integrationErrorMessage"
    })
  }

  default_route_settings {
    detailed_metrics_enabled = false
    throttling_burst_limit   = 5
    throttling_rate_limit    = 2
  }
}

resource "aws_lambda_permission" "api" {
  for_each = toset(["scenario", "ingest", "query", "diagnose"])

  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.function[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
