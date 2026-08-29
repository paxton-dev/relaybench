resource "aws_iam_openid_connect_provider" "github" {
  count = var.github_oidc_provider_arn == null ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  github_oidc_provider_arn = var.github_oidc_provider_arn == null ? aws_iam_openid_connect_provider.github[0].arn : var.github_oidc_provider_arn
  github_subjects = [
    "repo:${local.github_repository}:environment:${var.github_environment}",
    "repo:${var.github_owner}@*/${var.github_repository_name}@*:environment:${var.github_environment}",
  ]
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_subjects
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "relaybench-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.github_assume.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "github_iam" {
  statement {
    sid = "ManageRelayBenchServices"
    actions = [
      "apigateway:*",
      "cloudfront:*",
      "cloudwatch:*",
      "dynamodb:*",
      "events:*",
      "lambda:*",
      "logs:*",
      "s3:*",
      "sqs:*",
    ]
    resources = ["*"]
  }

  statement {
    sid = "ManageRelayBenchLambdaRoles"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:ListRolePolicies",
      "iam:ListRoleTags",
      "iam:PassRole",
      "iam:PutRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/relaybench-*"]
  }
}

resource "aws_iam_role_policy" "github_iam" {
  name   = "relaybench-iam-management"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_iam.json
}
