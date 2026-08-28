resource "aws_cloudwatch_metric_alarm" "delivery_dlq" {
  alarm_name          = "${local.prefix}-delivery-dlq-not-empty"
  alarm_description   = "A RelayBench delivery exhausted its retry policy."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.delivery_dlq.name
  }
}

resource "aws_cloudwatch_metric_alarm" "oldest_message" {
  alarm_name          = "${local.prefix}-delivery-age"
  alarm_description   = "RelayBench delivery processing is falling behind."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 120
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.delivery.name
  }
}

resource "aws_cloudwatch_metric_alarm" "delivery_errors" {
  alarm_name          = "${local.prefix}-delivery-errors"
  alarm_description   = "RelayBench delivery Lambda is returning errors."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.function["deliver"].function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "api_client_errors" {
  alarm_name          = "${local.prefix}-api-client-errors"
  alarm_description   = "RelayBench API is returning an unusual number of 4xx responses, including throttles."
  namespace           = "AWS/ApiGateway"
  metric_name         = "4xx"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 20
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiId = aws_apigatewayv2_api.api.id
    Stage = aws_apigatewayv2_stage.default.name
  }
}
