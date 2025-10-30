# circuitstream-aws-utils

AWS service integrations specifically designed for electronic component inventory management systems.

## Features

- **ComponentDatabase**: DynamoDB operations for component CRUD with advanced filtering
- **ComponentStorage**: S3 file management with presigned URLs for secure uploads
- **ComponentAnalyzer**: Rekognition-based AI component identification from images
- **StockAlerts**: SNS notifications for low stock warnings
- **CognitoAuth**: JWT authentication helpers for API Gateway Lambda functions

## Installation

```bash
npm install circuitstream-aws-utils
```

## Usage

### Component Database Operations

```javascript
import { ComponentDatabase } from 'circuitstream-aws-utils';

const db = new ComponentDatabase();

// Create a component
const component = await db.createComponent('userId123', {
  name: '1kΩ Resistor',
  componentType: 'resistor',
  quantity: 100,
  partNumber: 'RES-1K-0805',
  manufacturer: 'Yageo',
  minStockLevel: 20
});

// Get user's components with filters
const components = await db.getUserComponents('userId123', {
  type: 'resistor',
  lowStock: true,
  threshold: 50,
  search: '1k'
});

// Update component
const updated = await db.updateComponent('userId123', 'componentId', {
  quantity: 75
});

// Delete component
await db.deleteComponent('userId123', 'componentId');
```

### S3 Storage

```javascript
import { ComponentStorage } from 'circuitstream-aws-utils';

const storage = new ComponentStorage();

// Upload a file
await storage.uploadFile('images/resistor.jpg', fileBuffer, 'image/jpeg');

// Get presigned URL for upload
const uploadUrl = await storage.getUploadUrl('datasheets/spec.pdf');

// Delete a file
await storage.deleteFile('https://bucket.s3.amazonaws.com/images/old.jpg');
```

### Component Image Analysis

```javascript
import { ComponentAnalyzer } from 'circuitstream-aws-utils';

const analyzer = new ComponentAnalyzer();

// Analyze component from S3 image
const result = await analyzer.analyzeComponent('uploads/component.jpg');

console.log(result.componentData.type); // 'resistor'
console.log(result.summary); // AI-generated description
console.log(result.componentData.analysis.resistor.estimatedValue); // '1kΩ'
```

### Stock Alerts

```javascript
import { StockAlerts } from 'circuitstream-aws-utils';

const alerts = new StockAlerts();

// Subscribe user to alerts
await alerts.subscribeUser('user@example.com');

// Send low stock alert
await alerts.sendLowStockAlert(component, 'user@example.com');

// Send critical stock alert
await alerts.sendCriticalStockAlert(component, 'user@example.com');
```

### Cognito Authentication

```javascript
import { CognitoAuth } from 'circuitstream-aws-utils';

const auth = new CognitoAuth();

// Extract user from Lambda event
export const handler = async (event) => {
  const { userId, email } = auth.getUserContext(event);
  
  // Create standardized responses
  return auth.createResponse(200, { 
    message: 'Success',
    data: results 
  });
  
  // Or error responses
  return auth.createErrorResponse(400, 'Invalid request');
};
```

## Lambda Function Example

Complete Lambda function using the library:

```javascript
import { ComponentDatabase, CognitoAuth } from 'circuitstream-aws-utils';

const db = new ComponentDatabase();
const auth = new CognitoAuth();

export const handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return auth.createResponse(200, '');
    }

    const { userId } = auth.getUserContext(event);
    const body = JSON.parse(event.body);

    const component = await db.createComponent(userId, body);

    return auth.createResponse(201, {
      message: 'Component created',
      component
    });
  } catch (error) {
    return auth.createErrorResponse(500, error.message);
  }
};
```

## Environment Variables

Required environment variables for Lambda functions:

- `COMPONENTS_TABLE`: DynamoDB table name
- `COMPONENTS_BUCKET`: S3 bucket name
- `SNS_TOPIC_ARN`: SNS topic ARN for alerts

## Constants

The library includes useful constants:

```javascript
import { ComponentTypes, StockThresholds, ResistorColorCodes } from 'circuitstream-aws-utils';

console.log(ComponentTypes.RESISTOR); // 'resistor'
console.log(StockThresholds.LOW); // 20
console.log(ResistorColorCodes.BROWN); // 1
```

## Component Types

Supported component types:
- `resistor`
- `capacitor`
- `diode`
- `transistor`
- `integrated_circuit`
- `connector`
- `inductor`
- `sensor`
- `led`
- `crystal`

## AWS Permissions

Your Lambda execution role needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/YourComponentsTable"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:DetectLabels",
        "rekognition:DetectText"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sns:Publish",
        "sns:Subscribe"
      ],
      "Resource": "arn:aws:sns:*:*:YourStockAlertsTopic"
    }
  ]
}
```

## License

MIT

## Author

CircuitStream Team
