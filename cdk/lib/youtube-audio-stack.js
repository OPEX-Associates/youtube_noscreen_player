const cdk = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const apigateway = require('aws-cdk-lib/aws-apigateway');
const dynamodb = require('aws-cdk-lib/aws-dynamodb');
const cloudwatch = require('aws-cdk-lib/aws-cloudwatch');
const sns = require('aws-cdk-lib/aws-sns');
const subscriptions = require('aws-cdk-lib/aws-sns-subscriptions');
const iam = require('aws-cdk-lib/aws-iam');
const logs = require('aws-cdk-lib/aws-logs');

class YouTubeAudioStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const config = props.config;

    // DynamoDB table for request tracking and rate limiting
    const requestTable = new dynamodb.Table(this, 'RequestTracking', {
      tableName: 'youtube-audio-requests',
      partitionKey: { name: 'ipAddress', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
    });

    // Lambda function for audio extraction
    const extractAudioFunction = new lambda.Function(this, 'ExtractAudioFunction', {
      functionName: 'youtube-audio-extractor',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../netlify/functions', {
        bundling: {
          image: lambda.Runtime.NODEJS_18_X.bundlingImage,
          command: [
            'bash', '-c',
            'cp -r /asset-input/* /asset-output/ && cd /asset-output && npm ci --only=production || true'
          ]
        }
      }),
      timeout: cdk.Duration.seconds(config.lambdaTimeout),
      memorySize: config.lambdaMemory,
      environment: {
        REQUEST_TABLE: requestTable.tableName,
        MONTHLY_LIMIT: config.monthlyRequestLimit.toString(),
        RATE_LIMIT: config.rateLimit.toString(),
        RATE_LIMIT_PERIOD: config.rateLimitPeriod.toString(),
      },
      logRetention: logs.RetentionDays.ONE_WEEK, // Keep logs for 1 week
    });

    // Grant Lambda permissions to DynamoDB
    requestTable.grantReadWriteData(extractAudioFunction);

    // API Gateway with throttling
    const api = new apigateway.RestApi(this, 'YouTubeAudioApi', {
      restApiName: 'YouTube Audio Extraction API',
      description: 'API for extracting YouTube audio streams with cost controls',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: config.rateLimit,
        throttlingBurstLimit: config.rateLimit * 2,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false, // Disable to reduce costs
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: config.allowedOrigins,
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Usage plan for additional throttling
    const usagePlan = api.addUsagePlan('UsagePlan', {
      name: 'StandardUsagePlan',
      throttle: {
        rateLimit: config.rateLimit,
        burstLimit: config.rateLimit * 2,
      },
      quota: {
        limit: config.monthlyRequestLimit,
        period: apigateway.Period.MONTH,
      },
    });

    // Add API key for tracking (optional, can remove if you don't want API keys)
    const apiKey = api.addApiKey('ApiKey', {
      apiKeyName: 'youtube-audio-key',
    });
    usagePlan.addApiKey(apiKey);

    // Add endpoint
    const extractResource = api.root.addResource('extract-audio');
    const extractIntegration = new apigateway.LambdaIntegration(extractAudioFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' },
    });

    extractResource.addMethod('GET', extractIntegration, {
      apiKeyRequired: false, // Set to true if you want to require API key
      requestParameters: {
        'method.request.querystring.videoId': true,
      },
    });

    // SNS Topic for cost alerts
    const alertTopic = new sns.Topic(this, 'CostAlertTopic', {
      displayName: 'YouTube Audio API Cost Alerts',
    });

    alertTopic.addSubscription(
      new subscriptions.EmailSubscription(config.alertEmail)
    );

    // CloudWatch Alarms for cost monitoring
    
    // Alarm for high request count
    const requestAlarm = new cloudwatch.Alarm(this, 'HighRequestCountAlarm', {
      metric: api.metricCount({
        period: cdk.Duration.days(1),
      }),
      threshold: config.monthlyRequestLimit / 30, // Daily threshold
      evaluationPeriods: 1,
      alarmDescription: 'Alert when daily requests exceed expected limit',
      alarmName: 'youtube-audio-high-requests',
    });
    requestAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: alertTopic.topicArn }),
    });

    // Alarm for Lambda errors
    const errorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      metric: extractAudioFunction.metricErrors({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when Lambda function has many errors',
      alarmName: 'youtube-audio-lambda-errors',
    });
    errorAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: alertTopic.topicArn }),
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'YouTube Audio API Endpoint',
      exportName: 'YouTubeAudioApiEndpoint',
    });

    new cdk.CfnOutput(this, 'ApiKey', {
      value: apiKey.keyId,
      description: 'API Key ID (retrieve value from AWS Console)',
    });

    new cdk.CfnOutput(this, 'MonthlyRequestLimit', {
      value: config.monthlyRequestLimit.toString(),
      description: 'Maximum requests per month',
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:`,
      description: 'CloudWatch Dashboard URL',
    });
  }
}

module.exports = { YouTubeAudioStack };
