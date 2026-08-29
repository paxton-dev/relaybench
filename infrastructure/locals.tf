locals {
  project = "relaybench"
  prefix  = "${local.project}-${var.environment}"

  tags = {
    application = local.project
    environment = var.environment
    managed-by  = "terraform"
  }

  functions = {
    scenario = {
      timeout = 10
      memory  = 256
      environment = {
        EVENT_BUS_NAME = aws_cloudwatch_event_bus.main.name
        TABLE_NAME     = aws_dynamodb_table.main.name
      }
    }
    ingest = {
      timeout = 10
      memory  = 256
      environment = {
        EVENT_BUS_NAME = aws_cloudwatch_event_bus.main.name
        TABLE_NAME     = aws_dynamodb_table.main.name
      }
    }
    deliver = {
      timeout = 10
      memory  = 256
      environment = {
        TABLE_NAME = aws_dynamodb_table.main.name
      }
    }
    query = {
      timeout = 10
      memory  = 256
      environment = {
        TABLE_NAME = aws_dynamodb_table.main.name
      }
    }
    diagnose = {
      timeout = 25
      memory  = 256
      environment = {
        AI_MONTHLY_LIMIT = tostring(var.ai_monthly_diagnosis_limit)
        BEDROCK_MODEL_ID = var.bedrock_model_id
        TABLE_NAME       = aws_dynamodb_table.main.name
      }
    }
  }

  api_routes = {
    "POST /api/v1/scenarios/{scenario}" = {
      function      = "scenario"
      authorization = "NONE"
    }
    "POST /api/v1/events" = {
      function      = "ingest"
      authorization = "AWS_IAM"
    }
    "GET /api/v1/runs" = {
      function      = "query"
      authorization = "NONE"
    }
    "GET /api/v1/runs/{runId}" = {
      function      = "query"
      authorization = "NONE"
    }
    "POST /api/v1/runs/{runId}/diagnosis" = {
      function      = "diagnose"
      authorization = "NONE"
    }
    "GET /api/v1/schemas" = {
      function      = "query"
      authorization = "NONE"
    }
  }

  mime_types = {
    css         = "text/css; charset=utf-8"
    html        = "text/html; charset=utf-8"
    ico         = "image/x-icon"
    js          = "text/javascript; charset=utf-8"
    json        = "application/json; charset=utf-8"
    map         = "application/json; charset=utf-8"
    svg         = "image/svg+xml"
    txt         = "text/plain; charset=utf-8"
    webmanifest = "application/manifest+json"
  }
}
