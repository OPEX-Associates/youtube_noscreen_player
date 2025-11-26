const cdk = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const apigateway = require('aws-cdk-lib/aws-apigateway');

class YouTubeAudioStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const config = props.config;

    // Lambda function for audio extraction (no DynamoDB needed - using API Gateway throttling)
    const extractAudioFunction = new lambda.Function(this, 'ExtractAudioFunction', {
      functionName: 'youtube-audio-extractor',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'extract-audio.handler',
      code: lambda.Code.fromAsset('../netlify/functions'),
      timeout: cdk.Duration.seconds(config.lambdaTimeout),
      memorySize: config.lambdaMemory,
      environment: {
        NODE_ENV: 'production',
      },
      // Minimal CloudWatch - only errors
      logRetention: cdk.RemovalPolicy.DESTROY, // No log retention = no CloudWatch Logs cost
    });

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

    // Usage plan for throttling (built into API Gateway - FREE)
    const usagePlan = api.addUsagePlan('UsagePlan', {
      name: 'StandardUsagePlan',
      throttle: {
        rateLimit: config.rateLimit, // Requests per second
        burstLimit: config.rateLimit * 2,
      },
      quota: {
        limit: config.monthlyRequestLimit, // Total monthly requests
        period: apigateway.Period.MONTH,
      },
    });

    // Add endpoint
    const extractResource = api.root.addResource('extract-audio');
    const extractIntegration = new apigateway.LambdaIntegration(extractAudioFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' },
    });

    extractResource.addMethod('GET', extractIntegration, {
      apiKeyRequired: false,
      requestParameters: {
        'method.request.querystring.videoId': true,
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url + 'extract-audio',
      description: 'YouTube Audio API Endpoint - Use: ?videoId=VIDEO_ID',
      exportName: 'YouTubeAudioApiEndpoint',
    });

    new cdk.CfnOutput(this, 'MonthlyRequestLimit', {
      value: config.monthlyRequestLimit.toString(),
      description: 'Maximum requests per month (enforced by API Gateway)',
    });

    new cdk.CfnOutput(this, 'RateLimit', {
      value: `${config.rateLimit} requests/second`,
      description: 'Rate limit per second (enforced by API Gateway)',
    });
  }
}

module.exports = { YouTubeAudioStack };
