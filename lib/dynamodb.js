import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  UpdateCommand, 
  DeleteCommand, 
  ScanCommand, 
  QueryCommand 
} from '@aws-sdk/lib-dynamodb';

export class ComponentDatabase {
  constructor(config = {}) {
    const client = new DynamoDBClient({ 
      region: config.region || process.env.AWS_REGION || 'us-east-1' 
    });
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = config.tableName || process.env.COMPONENTS_TABLE || 'CircuitStreamComponents';
  }

  /**
   * Create a new component in inventory
   */
  async createComponent(userId, component) {
    const timestamp = new Date().toISOString();
    const componentId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const item = {
      componentId,
      userId,
      ...component,
      createdAt: timestamp,
      updatedAt: timestamp,
      stockHistory: [{
        date: timestamp,
        quantity: component.quantity || 0,
        action: 'initial'
      }]
    };

    await this.docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: item
    }));

    return item;
  }

  /**
   * Get a specific component by ID
   */
  async getComponent(userId, componentId) {
    const result = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { userId, componentId }
    }));

    return result.Item;
  }

  /**
   * Get all components for a user
   */
  async getUserComponents(userId, filters = {}) {
    const params = {
      TableName: this.tableName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };

    // Add filters if provided
    if (filters.type) {
      params.FilterExpression = 'componentType = :type';
      params.ExpressionAttributeValues[':type'] = filters.type;
    }

    if (filters.lowStock !== undefined && filters.threshold) {
      const filterExpr = params.FilterExpression ? 
        `${params.FilterExpression} AND quantity <= :threshold` : 
        'quantity <= :threshold';
      params.FilterExpression = filterExpr;
      params.ExpressionAttributeValues[':threshold'] = filters.threshold;
    }

    const result = await this.docClient.send(new QueryCommand(params));
    return result.Items || [];
  }

  /**
   * Update component details
   */
  async updateComponent(userId, componentId, updates) {
    const timestamp = new Date().toISOString();
    
    // Build update expression dynamically
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {
      ':updatedAt': timestamp
    };

    Object.keys(updates).forEach((key, index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;
      updateExpressions.push(`${attrName} = ${attrValue}`);
      expressionAttributeNames[attrName] = key;
      expressionAttributeValues[attrValue] = updates[key];
    });

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';

    const result = await this.docClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { userId, componentId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes;
  }

  /**
   * Update component stock quantity
   */
  async updateStock(userId, componentId, quantity, action = 'manual') {
    const timestamp = new Date().toISOString();
    const historyEntry = {
      date: timestamp,
      quantity,
      action
    };

    const result = await this.docClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { userId, componentId },
      UpdateExpression: 'SET quantity = :quantity, updatedAt = :updatedAt, stockHistory = list_append(if_not_exists(stockHistory, :emptyList), :history)',
      ExpressionAttributeValues: {
        ':quantity': quantity,
        ':updatedAt': timestamp,
        ':history': [historyEntry],
        ':emptyList': []
      },
      ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes;
  }

  /**
   * Delete a component
   */
  async deleteComponent(userId, componentId) {
    await this.docClient.send(new DeleteCommand({
      TableName: this.tableName,
      Key: { userId, componentId }
    }));

    return { success: true };
  }

  /**
   * Get components with low stock
   */
  async getLowStockComponents(userId, threshold = 10) {
    return this.getUserComponents(userId, { lowStock: true, threshold });
  }

  /**
   * Search components by part number or name
   */
  async searchComponents(userId, searchTerm) {
    const allComponents = await this.getUserComponents(userId);
    
    const lowerSearch = searchTerm.toLowerCase();
    return allComponents.filter(component => 
      (component.name && component.name.toLowerCase().includes(lowerSearch)) ||
      (component.partNumber && component.partNumber.toLowerCase().includes(lowerSearch)) ||
      (component.description && component.description.toLowerCase().includes(lowerSearch))
    );
  }
}
