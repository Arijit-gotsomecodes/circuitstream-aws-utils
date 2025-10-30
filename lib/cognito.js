export class CognitoAuth {
  constructor(config = {}) {
    this.userPoolId = config.userPoolId || process.env.COGNITO_USER_POOL_ID;
    this.clientId = config.clientId || process.env.COGNITO_CLIENT_ID;
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
  }

  /**
   * Parse JWT token to extract user information
   */
  parseToken(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        Buffer.from(base64, 'base64')
          .toString('ascii')
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      return JSON.parse(jsonPayload);
    } catch (error) {
      throw new Error('Invalid token format');
    }
  }

  /**
   * Extract user ID from token
   */
  getUserIdFromToken(token) {
    const payload = this.parseToken(token);
    return payload.sub || payload['cognito:username'];
  }

  /**
   * Extract email from token
   */
  getEmailFromToken(token) {
    const payload = this.parseToken(token);
    return payload.email;
  }

  /**
   * Verify token is not expired
   */
  isTokenExpired(token) {
    try {
      const payload = this.parseToken(token);
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp < currentTime;
    } catch (error) {
      return true;
    }
  }

  /**
   * Extract authorization token from API Gateway event
   */
  extractTokenFromEvent(event) {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    
    if (!authHeader) {
      throw new Error('No authorization header found');
    }

    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return authHeader;
  }

  /**
   * Get user context from API Gateway event
   */
  getUserContext(event) {
    try {
      const token = this.extractTokenFromEvent(event);
      
      if (this.isTokenExpired(token)) {
        throw new Error('Token expired');
      }

      return {
        userId: this.getUserIdFromToken(token),
        email: this.getEmailFromToken(token),
        token
      };
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Generate CORS headers for API responses
   */
  getCorsHeaders(origin = '*') {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    };
  }

  /**
   * Create API response with authentication context
   */
  createResponse(statusCode, body, additionalHeaders = {}) {
    return {
      statusCode,
      headers: {
        ...this.getCorsHeaders(),
        'Content-Type': 'application/json',
        ...additionalHeaders
      },
      body: JSON.stringify(body)
    };
  }

  /**
   * Create error response
   */
  createErrorResponse(statusCode, message) {
    return this.createResponse(statusCode, {
      error: message,
      timestamp: new Date().toISOString()
    });
  }
}
