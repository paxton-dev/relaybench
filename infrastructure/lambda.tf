data "archive_file" "function" {
  for_each = local.functions

  type        = "zip"
  source_dir  = "${path.module}/../.build/functions/${each.key}"
  output_path = "${path.module}/../.build/${each.key}.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  for_each = local.functions

  name               = "${local.prefix}-${each.key}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda" {
  for_each = local.functions

  statement {
    sid = "WriteFunctionLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.lambda[each.key].arn}:*"]
  }

  dynamic "statement" {
    for_each = contains(["scenario", "ingest"], each.key) ? [1] : []
    content {
      sid       = "PublishEvents"
      actions   = ["events:PutEvents"]
      resources = [aws_cloudwatch_event_bus.main.arn]
    }
  }

  dynamic "statement" {
    for_each = each.key == "scenario" ? [1] : []
    content {
      sid       = "WriteScenarioRuns"
      actions   = ["dynamodb:PutItem", "dynamodb:UpdateItem"]
      resources = [aws_dynamodb_table.main.arn]
    }
  }

  dynamic "statement" {
    for_each = each.key == "ingest" ? [1] : []
    content {
      sid       = "CreateProducerRun"
      actions   = ["dynamodb:PutItem"]
      resources = [aws_dynamodb_table.main.arn]
    }
  }

  dynamic "statement" {
    for_each = each.key == "deliver" ? [1] : []
    content {
      sid = "ProjectDeliveries"
      actions = [
        "dynamodb:PutItem",
        "dynamodb:TransactWriteItems",
        "dynamodb:UpdateItem",
      ]
      resources = [aws_dynamodb_table.main.arn]
    }
  }

  dynamic "statement" {
    for_each = each.key == "deliver" ? [1] : []
    content {
      sid = "ConsumeDeliveryQueue"
      actions = [
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:ReceiveMessage",
      ]
      resources = [aws_sqs_queue.delivery.arn]
    }
  }

  dynamic "statement" {
    for_each = each.key == "query" ? [1] : []
    content {
      sid       = "ReadDeliveryProjections"
      actions   = ["dynamodb:Query"]
      resources = [aws_dynamodb_table.main.arn, "${aws_dynamodb_table.main.arn}/index/RecentRuns"]
    }
  }

  dynamic "statement" {
    for_each = each.key == "diagnose" ? [1] : []
    content {
      sid = "ReadWriteDiagnoses"
      actions = [
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:UpdateItem",
      ]
      resources = [aws_dynamodb_table.main.arn]
    }
  }

  dynamic "statement" {
    for_each = each.key == "diagnose" ? [1] : []
    content {
      sid       = "InvokeDiagnosisModel"
      actions   = ["bedrock:InvokeModel"]
      resources = ["arn:aws:bedrock:${var.aws_region}::foundation-model/${var.bedrock_model_id}"]
    }
  }
}

resource "aws_iam_role_policy" "lambda" {
  for_each = local.functions

  name   = "${local.prefix}-${each.key}"
  role   = aws_iam_role.lambda[each.key].id
  policy = data.aws_iam_policy_document.lambda[each.key].json
}

resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.functions

  name              = "/aws/lambda/${local.prefix}-${each.key}"
  retention_in_days = 14
}

resource "aws_lambda_function" "function" {
  for_each = local.functions

  function_name    = "${local.prefix}-${each.key}"
  role             = aws_iam_role.lambda[each.key].arn
  filename         = data.archive_file.function[each.key].output_path
  source_code_hash = data.archive_file.function[each.key].output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  memory_size      = each.value.memory
  timeout          = each.value.timeout

  environment {
    variables = merge(each.value.environment, {
      LOG_LEVEL               = "INFO"
      POWERTOOLS_SERVICE_NAME = "relaybench-${each.key}"
    })
  }

  logging_config {
    log_format            = "JSON"
    application_log_level = "INFO"
    system_log_level      = "WARN"
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy.lambda,
  ]
}

resource "aws_lambda_event_source_mapping" "delivery" {
  event_source_arn                   = aws_sqs_queue.delivery.arn
  function_name                      = aws_lambda_function.function["deliver"].arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 1
  function_response_types            = ["ReportBatchItemFailures"]
  enabled                            = true

  scaling_config {
    maximum_concurrency = 2
  }
}
