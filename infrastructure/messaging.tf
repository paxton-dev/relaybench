resource "aws_cloudwatch_event_bus" "main" {
  name = "${local.prefix}-events"
}

resource "aws_sqs_queue" "delivery_dlq" {
  name                      = "${local.prefix}-delivery-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "delivery" {
  name                       = "${local.prefix}-delivery"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.delivery_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_cloudwatch_event_rule" "delivery_requested" {
  name           = "${local.prefix}-delivery-requested"
  description    = "Route supported RelayBench events to the webhook delivery queue."
  event_bus_name = aws_cloudwatch_event_bus.main.name

  event_pattern = jsonencode({
    source = ["relaybench.demo", "relaybench.producer"]
    detail-type = [
      "com.relaybench.customer.created.v1",
      "com.relaybench.subscription.activated.v1",
      "com.relaybench.invoice.payment-failed.v1"
    ]
  })
}

resource "aws_cloudwatch_event_target" "delivery_queue" {
  rule           = aws_cloudwatch_event_rule.delivery_requested.name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "delivery-queue"
  arn            = aws_sqs_queue.delivery.arn

  depends_on = [aws_sqs_queue_policy.delivery]
}

data "aws_iam_policy_document" "delivery_queue" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["sqs:*"]
    resources = [aws_sqs_queue.delivery.arn]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid    = "AllowEventBridgeDelivery"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.delivery.arn]

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.delivery_requested.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sqs_queue_policy" "delivery" {
  queue_url = aws_sqs_queue.delivery.id
  policy    = data.aws_iam_policy_document.delivery_queue.json
}
