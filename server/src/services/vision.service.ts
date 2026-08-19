import { GoogleGenAI } from '@google/genai';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { NotFoundError, ValidationError, ServiceUnavailableError } from '../errors/domain-error.js';

export type FrameClassificationType = 'slate' | 'ad' | 'content';
export type SlateType = 'looping_card' | 'black_screen' | 'static_logo' | null;

export interface FrameClassification {
  classification: FrameClassificationType;
  confidence: number;
  slate_type: SlateType;
  text_detected: string;
  visual_summary: string;
  contentHash: string;
  cached: boolean;
  timestampSeconds?: number;
  frameBase64?: string;
}

export class VisionService {
  private readonly ai: GoogleGenAI;
  private readonly modelName: string;
  private readonly mediaDir: string;
  private readonly cache = new Map<string, FrameClassification>();

  constructor(config?: { projectId?: string; region?: string; model?: string; mediaDir?: string }) {
    const project = config?.projectId || process.env.GCP_PROJECT_ID || 'agentic-cinema-ch-2026';
    const location = config?.region || process.env.GCP_REGION || 'us-central1';
    this.modelName = config?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    this.mediaDir = config?.mediaDir || path.resolve(process.cwd(), '../web/public/media');

    this.ai = new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
  }

  async extractFrame(videoPath: string, timestampSeconds: number): Promise<Buffer> {
    if (!fs.existsSync(videoPath)) {
      throw new NotFoundError(`Video file not found at ${videoPath}`);
    }

    if (timestampSeconds < 0) {
      throw new ValidationError('Timestamp must be non-negative');
    }

    return new Promise<Buffer>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-ss',
        timestampSeconds.toFixed(2),
        '-i',
        videoPath,
        '-vframes',
        '1',
        '-q:v',
        '2',
        '-f',
        'image2',
        'pipe:1',
      ]);

      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];

      ffmpeg.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on('data', (chunk: Buffer) => {
        errChunks.push(chunk);
      });

      ffmpeg.on('close', (code) => {
        if (code === 0 && chunks.length > 0) {
          resolve(Buffer.concat(chunks));
        } else {
          const errOutput = Buffer.concat(errChunks).toString('utf-8');
          reject(new ServiceUnavailableError(`ffmpeg frame extraction failed: ${errOutput}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(new ServiceUnavailableError(`Failed to spawn ffmpeg: ${err.message}`));
      });
    });
  }

  async classifyImage(imageBuffer: Buffer, mimeType = 'image/jpeg'): Promise<FrameClassification> {
    const contentHash = createHash('sha256').update(imageBuffer).digest('hex');

    // Idempotency rule: Check cache first
    const cached = this.cache.get(contentHash);
    if (cached) {
      return {
        ...cached,
        cached: true,
      };
    }

    const prompt = `
You are the GhostSlate Vision Classifier analyzing broadcast video stream frames for SCTE-35 SSAI slate bleed detection.

Classify the provided frame into exactly one category:
1. "slate": A filler slate/looping card/card saying "we will be right back", "commercial break in progress", or a blank screen.
2. "ad": A commercial advertisement spot / brand creative.
3. "content": Main broadcast program / sports / show / live event coverage.

Provide output adhering strictly to this JSON structure:
{
  "classification": "slate" | "ad" | "content",
  "confidence": number between 0.0 and 1.0,
  "slate_type": "looping_card" | "black_screen" | "static_logo" | null,
  "text_detected": "exact visible headline text in image",
  "visual_summary": "brief description of colors, logos and scene"
}
`.trim();

    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const responseText = response.text?.trim() || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = {
        classification: 'content',
        confidence: 0.5,
        slate_type: null,
        text_detected: '',
        visual_summary: responseText,
      };
    }

    const classification: FrameClassification = {
      classification: (parsed.classification as FrameClassificationType) || 'content',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
      slate_type: (parsed.slate_type as SlateType) ?? null,
      text_detected: String(parsed.text_detected || ''),
      visual_summary: String(parsed.visual_summary || ''),
      contentHash,
      cached: false,
    };

    this.cache.set(contentHash, classification);
    return classification;
  }

  async classifyVideoTimestamp(
    videoFileName: string,
    timestampSeconds: number,
  ): Promise<FrameClassification> {
    const base = path.basename(videoFileName);

    if (
      !videoFileName ||
      videoFileName !== base ||
      videoFileName.includes('..') ||
      videoFileName.includes('/') ||
      videoFileName.includes('\\')
    ) {
      throw new ValidationError(`Invalid video filename: ${videoFileName}`);
    }

    const videoPath = path.resolve(this.mediaDir, videoFileName);
    if (!videoPath.startsWith(this.mediaDir + path.sep)) {
      throw new ValidationError(`Path traversal detected for video file: ${videoFileName}`);
    }

    const frameBuffer = await this.extractFrame(videoPath, timestampSeconds);
    const result = await this.classifyImage(frameBuffer, 'image/jpeg');

    return {
      ...result,
      timestampSeconds,
      frameBase64: `data:image/jpeg;base64,${frameBuffer.toString('base64')}`,
    };
  }
}
