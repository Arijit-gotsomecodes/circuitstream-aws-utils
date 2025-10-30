import { SNSClient, PublishCommand, SubscribeCommand, UnsubscribeCommand } from '@aws-sdk/client-sns';

export class StockAlerts {
  constructor(config = {}) {
    this.client = new SNSClient({ 
      region: config.region || process.env.AWS_REGION || 'us-east-1' 
    });
    this.topicArn = config.topicArn || process.env.SNS_TOPIC_ARN;
  }

  /**
   * Send low stock alert notification
   */
  async sendLowStockAlert(component, userEmail) {
    const message = this.formatLowStockMessage(component);
    const subject = `⚠️ Low Stock Alert: ${component.name || component.partNumber}`;

    return await this.publishMessage(message, subject, {
      componentId: component.componentId,
      alertType: 'low_stock',
      userEmail
    });
  }

  /**
   * Send out of stock alert
   */
  async sendOutOfStockAlert(component, userEmail) {
    const message = this.formatOutOfStockMessage(component);
    const subject = `🔴 Out of Stock: ${component.name || component.partNumber}`;

    return await this.publishMessage(message, subject, {
      componentId: component.componentId,
      alertType: 'out_of_stock',
      userEmail
    });
  }

  /**
   * Send critical stock alert
   */
  async sendCriticalStockAlert(component, userEmail, threshold) {
    const message = this.formatCriticalStockMessage(component, threshold);
    const subject = `🚨 Critical Stock Level: ${component.name || component.partNumber}`;

    return await this.publishMessage(message, subject, {
      componentId: component.componentId,
      alertType: 'critical_stock',
      userEmail
    });
  }

  /**
   * Publish message to SNS topic
   */
  async publishMessage(message, subject, attributes = {}) {
    const params = {
      TopicArn: this.topicArn,
      Message: message,
      Subject: subject,
      MessageAttributes: {}
    };

    // Add message attributes
    for (const [key, value] of Object.entries(attributes)) {
      params.MessageAttributes[key] = {
        DataType: 'String',
        StringValue: String(value)
      };
    }

    const result = await this.client.send(new PublishCommand(params));
    return {
      messageId: result.MessageId,
      success: true
    };
  }

  /**
   * Subscribe email to alerts
   */
  async subscribeEmail(email) {
    const params = {
      Protocol: 'email',
      TopicArn: this.topicArn,
      Endpoint: email
    };

    const result = await this.client.send(new SubscribeCommand(params));
    return {
      subscriptionArn: result.SubscriptionArn,
      success: true,
      message: 'Confirmation email sent. Please check your inbox.'
    };
  }

  /**
   * Unsubscribe from alerts
   */
  async unsubscribe(subscriptionArn) {
    await this.client.send(new UnsubscribeCommand({
      SubscriptionArn: subscriptionArn
    }));

    return { success: true };
  }

  /**
   * Check if component stock is below threshold and send alert
   */
  async checkAndAlert(component, userEmail, thresholds = { critical: 5, low: 10 }) {
    const quantity = component.quantity || 0;
    
    if (quantity === 0) {
      return await this.sendOutOfStockAlert(component, userEmail);
    } else if (quantity <= thresholds.critical) {
      return await this.sendCriticalStockAlert(component, userEmail, thresholds.critical);
    } else if (quantity <= thresholds.low) {
      return await this.sendLowStockAlert(component, userEmail);
    }

    return { alerted: false };
  }

  /**
   * Format low stock message
   */
  formatLowStockMessage(component) {
    return `
Low Stock Alert - CircuitStream

Component: ${component.name || 'Unnamed Component'}
Part Number: ${component.partNumber || 'N/A'}
Type: ${component.componentType || 'Unknown'}
Current Stock: ${component.quantity || 0} units
Location: ${component.location || 'Not specified'}

Your component stock is running low. Consider reordering soon.

---
CircuitStream Component Inventory Manager
    `.trim();
  }

  /**
   * Format out of stock message
   */
  formatOutOfStockMessage(component) {
    return `
Out of Stock Alert - CircuitStream

Component: ${component.name || 'Unnamed Component'}
Part Number: ${component.partNumber || 'N/A'}
Type: ${component.componentType || 'Unknown'}
Current Stock: 0 units
Location: ${component.location || 'Not specified'}

This component is now out of stock. Immediate reorder recommended.

---
CircuitStream Component Inventory Manager
    `.trim();
  }

  /**
   * Format critical stock message
   */
  formatCriticalStockMessage(component, threshold) {
    return `
Critical Stock Alert - CircuitStream

Component: ${component.name || 'Unnamed Component'}
Part Number: ${component.partNumber || 'N/A'}
Type: ${component.componentType || 'Unknown'}
Current Stock: ${component.quantity || 0} units (Critical threshold: ${threshold})
Location: ${component.location || 'Not specified'}

CRITICAL: Stock level has reached critical threshold. Immediate action required.

---
CircuitStream Component Inventory Manager
    `.trim();
  }
}
