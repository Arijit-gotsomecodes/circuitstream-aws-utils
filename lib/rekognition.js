import { RekognitionClient, DetectLabelsCommand, DetectTextCommand } from '@aws-sdk/client-rekognition';
import { ResistorColorCodes } from './constants.js';

export class ComponentAnalyzer {
  constructor(config = {}) {
    this.client = new RekognitionClient({ 
      region: config.region || process.env.AWS_REGION || 'us-east-1' 
    });
    this.minConfidence = config.minConfidence || 70;
  }

  /**
   * Analyze component image using Rekognition
   */
  async analyzeComponent(imageSource) {
    const [labels, text] = await Promise.all([
      this.detectLabels(imageSource),
      this.detectText(imageSource)
    ]);

    return this.interpretResults(labels, text);
  }

  /**
   * Detect labels in the image
   */
  async detectLabels(imageSource) {
    const params = {
      Image: this.buildImageParam(imageSource),
      MinConfidence: this.minConfidence,
      MaxLabels: 20
    };

    const result = await this.client.send(new DetectLabelsCommand(params));
    return result.Labels || [];
  }

  /**
   * Detect text in the image
   */
  async detectText(imageSource) {
    const params = {
      Image: this.buildImageParam(imageSource)
    };

    const result = await this.client.send(new DetectTextCommand(params));
    return result.TextDetections || [];
  }

  /**
   * Build image parameter for Rekognition
   */
  buildImageParam(imageSource) {
    if (imageSource.bucket && imageSource.key) {
      return {
        S3Object: {
          Bucket: imageSource.bucket,
          Name: imageSource.key
        }
      };
    } else if (imageSource.bytes) {
      return {
        Bytes: imageSource.bytes
      };
    }
    throw new Error('Invalid image source. Provide either S3 object or bytes.');
  }

  /**
   * Interpret Rekognition results to identify component
   */
  interpretResults(labels, textDetections) {
    const componentData = {
      confidence: 0,
      type: 'unknown',
      possibleTypes: [],
      detectedLabels: labels.map(l => ({ name: l.Name, confidence: l.Confidence })),
      detectedText: textDetections
        .filter(t => t.Type === 'LINE')
        .map(t => ({ text: t.DetectedText, confidence: t.Confidence })),
      analysis: {}
    };

    // Identify component type from labels
    const componentTypes = this.identifyComponentType(labels);
    if (componentTypes.length > 0) {
      componentData.type = componentTypes[0].type;
      componentData.confidence = componentTypes[0].confidence;
      componentData.possibleTypes = componentTypes;
    }

    // Extract specific component details
    if (componentData.type === 'resistor') {
      componentData.analysis.resistor = this.analyzeResistor(labels, textDetections);
    } else if (componentData.type === 'capacitor') {
      componentData.analysis.capacitor = this.analyzeCapacitor(textDetections);
    } else if (componentData.type === 'integrated_circuit') {
      componentData.analysis.ic = this.analyzeIC(textDetections);
    }

    return componentData;
  }

  /**
   * Identify component type from labels
   */
  identifyComponentType(labels) {
    const typeKeywords = {
      resistor: ['resistor', 'resistance', 'band', 'cylinder', 'electronic component'],
      capacitor: ['capacitor', 'electrolytic', 'ceramic'],
      diode: ['diode', 'led', 'semiconductor'],
      transistor: ['transistor', 'mosfet', 'bjt'],
      integrated_circuit: ['chip', 'ic', 'microchip', 'processor', 'circuit board'],
      connector: ['connector', 'pin', 'header', 'socket'],
      inductor: ['inductor', 'coil']
    };

    const matches = [];
    
    for (const [type, keywords] of Object.entries(typeKeywords)) {
      for (const label of labels) {
        const labelLower = label.Name.toLowerCase();
        if (keywords.some(keyword => labelLower.includes(keyword))) {
          matches.push({
            type,
            confidence: label.Confidence,
            matchedLabel: label.Name
          });
          break;
        }
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Analyze resistor-specific features
   */
  analyzeResistor(labels, textDetections) {
    const analysis = {
      hasColorBands: false,
      detectedColors: [],
      estimatedValue: null
    };

    // Check for color-related labels
    const colorLabels = labels.filter(l => 
      Object.keys(ResistorColorCodes).some(color => 
        l.Name.toLowerCase().includes(color.toLowerCase())
      )
    );

    if (colorLabels.length >= 2) {
      analysis.hasColorBands = true;
      analysis.detectedColors = colorLabels.map(l => l.Name);
      analysis.note = 'Resistor identified with visible color bands';
    }

    // Try to extract resistance value from text
    const texts = textDetections
      .filter(t => t.Type === 'LINE')
      .map(t => t.DetectedText);
    
    const resistancePattern = /(\d+\.?\d*)\s*([kKmM]?)(Ω|ohm|R)/i;
    for (const text of texts) {
      const match = text.match(resistancePattern);
      if (match) {
        analysis.estimatedValue = `${match[1]}${match[2]}Ω`;
        break;
      }
    }

    return analysis;
  }

  /**
   * Analyze capacitor-specific features
   */
  analyzeCapacitor(textDetections) {
    const analysis = {
      estimatedValue: null,
      voltage: null
    };

    const texts = textDetections
      .filter(t => t.Type === 'LINE')
      .map(t => t.DetectedText);
    
    // Capacitance pattern
    const capacitancePattern = /(\d+\.?\d*)\s*([µuμpnm]?F)/i;
    // Voltage pattern
    const voltagePattern = /(\d+)\s*V/i;

    for (const text of texts) {
      const capMatch = text.match(capacitancePattern);
      if (capMatch) {
        analysis.estimatedValue = `${capMatch[1]}${capMatch[2]}`;
      }
      
      const voltMatch = text.match(voltagePattern);
      if (voltMatch) {
        analysis.voltage = `${voltMatch[1]}V`;
      }
    }

    return analysis;
  }

  /**
   * Analyze IC-specific features
   */
  analyzeIC(textDetections) {
    const analysis = {
      partNumbers: [],
      manufacturers: []
    };

    const texts = textDetections
      .filter(t => t.Type === 'LINE')
      .map(t => t.DetectedText);
    
    // Common manufacturer prefixes
    const manufacturerPrefixes = ['74', 'CD', 'LM', 'TL', 'NE', 'MC', 'SN', 'AD', 'MAX'];
    
    for (const text of texts) {
      // Check if it looks like a part number (alphanumeric, typically 4-12 chars)
      if (/^[A-Z0-9]{4,12}$/i.test(text.trim())) {
        analysis.partNumbers.push(text.trim());
        
        // Check for manufacturer prefix
        const prefix = text.substring(0, 2).toUpperCase();
        if (manufacturerPrefixes.includes(prefix)) {
          analysis.manufacturers.push(`Likely ${prefix} series`);
        }
      }
    }

    return analysis;
  }

  /**
   * Generate human-readable identification summary
   */
  generateIdentificationSummary(analysisResult) {
    const { type, confidence, analysis } = analysisResult;
    
    let summary = `Identified as: ${type} (${confidence.toFixed(1)}% confidence)`;
    
    if (type === 'resistor' && analysis.resistor) {
      if (analysis.resistor.estimatedValue) {
        summary += `\nEstimated value: ${analysis.resistor.estimatedValue}`;
      } else if (analysis.resistor.hasColorBands) {
        summary += `\nColor bands detected: ${analysis.resistor.detectedColors.join(', ')}`;
      }
    } else if (type === 'capacitor' && analysis.capacitor) {
      if (analysis.capacitor.estimatedValue) {
        summary += `\nEstimated value: ${analysis.capacitor.estimatedValue}`;
      }
      if (analysis.capacitor.voltage) {
        summary += `\nRated voltage: ${analysis.capacitor.voltage}`;
      }
    } else if (type === 'integrated_circuit' && analysis.ic) {
      if (analysis.ic.partNumbers.length > 0) {
        summary += `\nDetected part numbers: ${analysis.ic.partNumbers.join(', ')}`;
      }
    }

    return summary;
  }
}
