import { describe, it, expect } from 'vitest';
import { VisionService } from '../src/services/vision.service.js';
import { ValidationError } from '../src/errors/domain-error.js';

describe('VisionService', () => {
  it('instantiates cleanly with default configuration', () => {
    const vision = new VisionService();
    expect(vision).toBeInstanceOf(VisionService);
  });

  it('rejects path traversal attempts with ValidationError', async () => {
    const vision = new VisionService();
    const maliciousPaths = [
      '../../../../etc/passwd',
      '../test.mp4',
      'subdir/test.mp4',
      '/var/log/system.log',
      '..\\windows\\system32',
      '',
    ];

    for (const badPath of maliciousPaths) {
      await expect(vision.classifyVideoTimestamp(badPath, 5)).rejects.toThrow(ValidationError);
    }
  });
});
