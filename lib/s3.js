import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class ComponentStorage {
  constructor(config = {}) {
    this.client = new S3Client({ 
      region: config.region || process.env.AWS_REGION || 'us-east-1' 
    });
    this.bucketName = config.bucketName || process.env.COMPONENTS_BUCKET || 'circuitstream-components';
  }

  /**
   * Upload component image
   */
  async uploadImage(userId, componentId, imageBuffer, contentType = 'image/jpeg') {
    const key = `images/${userId}/${componentId}/${Date.now()}.jpg`;
    
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType,
      Metadata: {
        userId,
        componentId,
        uploadDate: new Date().toISOString()
      }
    }));

    return {
      key,
      url: `https://${this.bucketName}.s3.amazonaws.com/${key}`
    };
  }

  /**
   * Upload datasheet PDF
   */
  async uploadDatasheet(userId, componentId, pdfBuffer, filename) {
    const key = `datasheets/${userId}/${componentId}/${filename}`;
    
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        userId,
        componentId,
        uploadDate: new Date().toISOString()
      }
    }));

    return {
      key,
      url: `https://${this.bucketName}.s3.amazonaws.com/${key}`
    };
  }

  /**
   * Upload identification image (for Rekognition analysis)
   */
  async uploadIdentificationImage(userId, imageBuffer, contentType = 'image/jpeg') {
    const key = `identification/${userId}/${Date.now()}.jpg`;
    
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType,
      Metadata: {
        userId,
        purpose: 'identification',
        uploadDate: new Date().toISOString()
      }
    }));

    return {
      key,
      bucket: this.bucketName,
      url: `https://${this.bucketName}.s3.amazonaws.com/${key}`
    };
  }

  /**
   * Get presigned URL for secure file access
   */
  async getPresignedUrl(key, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key) {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key
    }));

    return { success: true };
  }

  /**
   * Generate upload presigned URL for client-side uploads
   */
  async getUploadPresignedUrl(userId, componentId, fileType = 'image', expiresIn = 300) {
    const extension = fileType === 'pdf' ? 'pdf' : 'jpg';
    const folder = fileType === 'pdf' ? 'datasheets' : 'images';
    const key = `${folder}/${userId}/${componentId}/${Date.now()}.${extension}`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: fileType === 'pdf' ? 'application/pdf' : 'image/jpeg'
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    
    return { url, key };
  }
}
