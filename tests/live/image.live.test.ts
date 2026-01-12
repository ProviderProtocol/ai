/**
 * @fileoverview Live API tests for image generation functionality across providers.
 *
 * These tests require valid API keys set in environment variables:
 * - OPENAI_API_KEY for OpenAI image generation (DALL-E, GPT-Image)
 * - XAI_API_KEY for xAI image generation (Aurora)
 * - GOOGLE_API_KEY for Google Imagen
 *
 * IMPORTANT: These tests make real API calls that cost money.
 * Run sparingly and be aware of rate limits.
 */
import { test, expect, describe } from 'bun:test';
import { image } from '../../src/index.ts';
import { openai } from '../../src/providers/openai/index.ts';
import { xai } from '../../src/providers/xai/index.ts';
import { google } from '../../src/providers/google/index.ts';
import type { OpenAIImageParams } from '../../src/providers/openai/index.ts';
import type { XAIImageParams } from '../../src/providers/xai/index.ts';
import type { GoogleImagenParams } from '../../src/providers/google/index.ts';
import { UPPError } from '../../src/types/errors.ts';
import { Image } from '../../src/core/media/Image.ts';

// Check for API keys
const HAS_OPENAI_KEY = !!process.env.OPENAI_API_KEY;
const HAS_XAI_KEY = !!process.env.XAI_API_KEY;
const HAS_GOOGLE_KEY = !!process.env.GOOGLE_API_KEY;

// Test models
const OPENAI_MODEL = 'dall-e-3';
const OPENAI_MODEL_DALLE2 = 'dall-e-2';
const XAI_MODEL = 'grok-2-image-1212';
const GOOGLE_MODEL = 'imagen-4.0-generate-001';

/**
 * OpenAI Image Generation Tests (DALL-E)
 */
describe.skipIf(!HAS_OPENAI_KEY)('OpenAI Image Generation', () => {
  test('generates image with DALL-E 3', async () => {
    const controller = new AbortController();
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL),
      params: {
        size: '1024x1024',
        quality: 'standard',
      },
    });

    const result = await imageGen.generate('A simple red circle on a white background', {
      signal: controller.signal,
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.image).toBeInstanceOf(Image);
    expect(result.usage?.imagesGenerated).toBe(1);
  }, 60000);

  test('returns revised prompt in metadata', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL),
      params: { size: '1024x1024' },
    });

    const result = await imageGen.generate('A cat');

    expect(result.images[0]!.metadata?.revised_prompt).toBeDefined();
    expect(typeof result.images[0]!.metadata?.revised_prompt).toBe('string');
  }, 60000);

  test('supports different sizes', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL),
      params: { size: '1792x1024' },
    });

    const result = await imageGen.generate('A landscape scene');

    expect(result.images).toHaveLength(1);
  }, 60000);

  test('supports quality parameter', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL),
      params: {
        size: '1024x1024',
        quality: 'hd',
      },
    });

    const result = await imageGen.generate('A detailed cityscape');

    expect(result.images).toHaveLength(1);
  }, 60000);

  test('supports style parameter', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL),
      params: {
        size: '1024x1024',
        style: 'natural',
      },
    });

    const result = await imageGen.generate('A forest scene');

    expect(result.images).toHaveLength(1);
  }, 60000);

  test('DALL-E 2 generates multiple images', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL_DALLE2),
      params: {
        size: '256x256',
        n: 2,
      },
    });

    const result = await imageGen.generate('A simple geometric pattern');

    expect(result.images).toHaveLength(2);
    expect(result.usage?.imagesGenerated).toBe(2);
  }, 60000);

  test('supports b64_json response format', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL_DALLE2),
      params: {
        size: '256x256',
        response_format: 'b64_json',
      },
    });

    const result = await imageGen.generate('A blue square');

    expect(result.images).toHaveLength(1);
    const img = result.images[0]!.image;
    expect(img.toBytes().length).toBeGreaterThan(0);
  }, 60000);

  test('exposes correct capabilities for DALL-E 3', () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL),
    });

    expect(imageGen.capabilities.generate).toBe(true);
    expect(imageGen.capabilities.edit).toBe(true);
    expect(imageGen.capabilities.maxImages).toBe(1);
  });

  test('exposes correct capabilities for DALL-E 2', () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL_DALLE2),
    });

    expect(imageGen.capabilities.generate).toBe(true);
    expect(imageGen.capabilities.edit).toBe(true);
    expect(imageGen.capabilities.maxImages).toBe(10);
  });
});

/**
 * xAI Image Generation Tests (Aurora)
 */
describe.skipIf(!HAS_XAI_KEY)('xAI Image Generation', () => {
  test('generates image with Aurora', async () => {
    const imageGen = image<XAIImageParams>({
      model: xai(XAI_MODEL),
    });

    const result = await imageGen.generate('A simple blue triangle');

    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.image).toBeInstanceOf(Image);
  }, 60000);

  test('generates multiple images', async () => {
    const imageGen = image<XAIImageParams>({
      model: xai(XAI_MODEL),
      params: { n: 2 },
    });

    const result = await imageGen.generate('A simple pattern');

    expect(result.images).toHaveLength(2);
  }, 60000);

  test('supports b64_json response format', async () => {
    const imageGen = image<XAIImageParams>({
      model: xai(XAI_MODEL),
      params: { response_format: 'b64_json' },
    });

    const result = await imageGen.generate('A green circle');

    expect(result.images).toHaveLength(1);
    const img = result.images[0]!.image;
    expect(img.toBytes().length).toBeGreaterThan(0);
  }, 60000);

  test('exposes correct capabilities', () => {
    const imageGen = image<XAIImageParams>({
      model: xai(XAI_MODEL),
    });

    expect(imageGen.capabilities.generate).toBe(true);
    expect(imageGen.capabilities.streaming).toBe(false);
    expect(imageGen.capabilities.edit).toBe(false);
    expect(imageGen.capabilities.maxImages).toBe(10);
  });
});

/**
 * Google Imagen Tests
 */
describe.skipIf(!HAS_GOOGLE_KEY)('Google Imagen', () => {
  test('generates image with Imagen 4', async () => {
    const imageGen = image<GoogleImagenParams>({
      model: google(GOOGLE_MODEL),
      params: { sampleCount: 1 },
    });

    const result = await imageGen.generate('A simple yellow star');

    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.image).toBeInstanceOf(Image);
  }, 60000);

  test('generates multiple images with sampleCount', async () => {
    const imageGen = image<GoogleImagenParams>({
      model: google(GOOGLE_MODEL),
      params: { sampleCount: 2 },
    });

    const result = await imageGen.generate('A colorful abstract pattern');

    expect(result.images).toHaveLength(2);
  }, 60000);

  test('supports aspect ratio parameter', async () => {
    const imageGen = image<GoogleImagenParams>({
      model: google(GOOGLE_MODEL),
      params: { sampleCount: 1, aspectRatio: '16:9' },
    });

    const result = await imageGen.generate('A wide landscape');

    expect(result.images).toHaveLength(1);
  }, 60000);

  test('supports imageSize parameter', async () => {
    const imageGen = image<GoogleImagenParams>({
      model: google(GOOGLE_MODEL),
      params: { sampleCount: 1, imageSize: '1K' },
    });

    const result = await imageGen.generate('A simple image');

    expect(result.images).toHaveLength(1);
  }, 60000);

  test('supports personGeneration parameter', async () => {
    const imageGen = image<GoogleImagenParams>({
      model: google(GOOGLE_MODEL),
      params: { sampleCount: 1, personGeneration: 'dont_allow' },
    });

    const result = await imageGen.generate('A mountain landscape');

    expect(result.images).toHaveLength(1);
  }, 60000);

  test('exposes correct capabilities', () => {
    const imageGen = image<GoogleImagenParams>({
      model: google(GOOGLE_MODEL),
    });

    expect(imageGen.capabilities.generate).toBe(true);
    expect(imageGen.capabilities.streaming).toBe(false);
    expect(imageGen.capabilities.edit).toBe(false);
    expect(imageGen.capabilities.maxImages).toBe(4);
  });
});

/**
 * Error Handling Tests
 */
describe('Image Generation Error Handling', () => {
  test.skipIf(!HAS_OPENAI_KEY)('invalid model returns error', async () => {
    const imageGen = image({
      model: openai('nonexistent-image-model'),
    });

    try {
      await imageGen.generate('test');
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.provider).toBe('openai');
      expect(uppError.modality).toBe('image');
    }
  }, 30000);

  test('invalid API key returns authentication error', async () => {
    const imageGen = image({
      model: openai(OPENAI_MODEL),
      config: { apiKey: 'invalid-key' },
    });

    try {
      await imageGen.generate('test');
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(UPPError);
      const uppError = error as UPPError;
      expect(uppError.code).toBe('AUTHENTICATION_FAILED');
    }
  }, 30000);
});

/**
 * Image Output Format Tests
 */
describe.skipIf(!HAS_OPENAI_KEY)('Image Output Formats', () => {
  test('image can be converted to base64', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL_DALLE2),
      params: {
        size: '256x256',
        response_format: 'b64_json',
      },
    });

    const result = await imageGen.generate('A simple test image');

    const img = result.images[0]!.image;
    const base64 = img.toBase64();

    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);
  }, 60000);

  test('image can be converted to bytes', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL_DALLE2),
      params: {
        size: '256x256',
        response_format: 'b64_json',
      },
    });

    const result = await imageGen.generate('A simple test image');

    const img = result.images[0]!.image;
    const bytes = img.toBytes();

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  }, 60000);

  test('image has correct mime type', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL_DALLE2),
      params: {
        size: '256x256',
        response_format: 'b64_json',
      },
    });

    const result = await imageGen.generate('A simple test image');

    const img = result.images[0]!.image;
    expect(img.mimeType).toBe('image/png');
  }, 60000);
});

/**
 * Image Edit Tests (DALL-E 2)
 *
 * DALL-E 2 supports image editing with an optional mask.
 * The mask is a PNG with transparent areas indicating where to edit.
 */
describe.skipIf(!HAS_OPENAI_KEY)('OpenAI Image Edit', () => {
  test('edits image without mask (requires RGBA source with transparency)', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL_DALLE2),
      params: {
        size: '256x256',
        response_format: 'b64_json',
      },
    });

    // OpenAI edit API without mask requires RGBA image with transparent areas.
    // Create a simple RGBA image with a red background and transparent center.
    const sourceImage = createRGBAImageWithTransparency(256, 256);

    // Edit the image (transparent areas indicate where to edit)
    const result = await imageGen.edit!({
      image: sourceImage,
      prompt: 'Add a blue star in the transparent area',
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.image).toBeInstanceOf(Image);
  }, 120000);

  test('edits image with mask', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL_DALLE2),
      params: {
        size: '256x256',
        response_format: 'b64_json',
      },
    });

    // Generate source image
    const generated = await imageGen.generate('A red circle on white background');
    const sourceImage = generated.images[0]!.image;

    // Create a simple RGBA PNG mask with transparent center
    // This is a minimal 256x256 PNG with a transparent square in the middle
    const maskData = createSimpleMask(256, 256);
    const mask = Image.fromBytes(maskData, 'image/png');

    const result = await imageGen.edit!({
      image: sourceImage,
      mask,
      prompt: 'Add a blue star in the center',
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.image).toBeInstanceOf(Image);
  }, 120000);
});

/**
 * Creates a simple PNG mask with a transparent center region.
 * The outer area is opaque black, the center is transparent.
 */
function createSimpleMask(width: number, height: number): Uint8Array {
  // Create raw RGBA pixel data
  const pixels = new Uint8Array(width * height * 4);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < radius) {
        // Transparent center (where edit will occur)
        pixels[idx] = 0;     // R
        pixels[idx + 1] = 0; // G
        pixels[idx + 2] = 0; // B
        pixels[idx + 3] = 0; // A (transparent)
      } else {
        // Opaque outer area (will be preserved)
        pixels[idx] = 0;       // R
        pixels[idx + 1] = 0;   // G
        pixels[idx + 2] = 0;   // B
        pixels[idx + 3] = 255; // A (opaque)
      }
    }
  }

  return encodePNG(pixels, width, height);
}

/**
 * Minimal PNG encoder for RGBA data.
 * Creates an uncompressed PNG (sufficient for testing).
 */
function encodePNG(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Create raw image data with filter bytes
  const rawData = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter type: none
    for (let x = 0; x < width * 4; x++) {
      rawData[y * (1 + width * 4) + 1 + x] = pixels[y * width * 4 + x]!;
    }
  }

  // Compress with deflate (using zlib format)
  const compressed = deflateRaw(rawData);

  // Build chunks
  const chunks: Uint8Array[] = [
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', new Uint8Array(0)),
  ];

  // Concatenate all chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Creates a PNG chunk with CRC.
 */
function createChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);

  // Length
  view.setUint32(0, data.length, false);

  // Type
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }

  // Data
  chunk.set(data, 8);

  // CRC32 of type + data
  const crcData = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) {
    crcData[i] = type.charCodeAt(i);
  }
  crcData.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcData), false);

  return chunk;
}

/**
 * Simple CRC32 implementation for PNG.
 */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Minimal deflate compression (zlib format) for PNG IDAT.
 * Uses stored blocks only (no actual compression) for simplicity.
 */
function deflateRaw(data: Uint8Array): Uint8Array {
  // Zlib header: CMF=0x78 (deflate, 32K window), FLG=0x01 (no dict, check bits)
  const maxBlockSize = 65535;
  const numBlocks = Math.ceil(data.length / maxBlockSize);
  const outputSize = 2 + numBlocks * 5 + data.length + 4; // header + block headers + data + adler32
  const output = new Uint8Array(outputSize);

  output[0] = 0x78; // CMF
  output[1] = 0x01; // FLG

  let outPos = 2;
  let inPos = 0;

  for (let block = 0; block < numBlocks; block++) {
    const remaining = data.length - inPos;
    const blockSize = Math.min(remaining, maxBlockSize);
    const isLast = block === numBlocks - 1;

    // Block header: BFINAL (1 bit) + BTYPE=00 (2 bits) = stored block
    output[outPos++] = isLast ? 0x01 : 0x00;
    // LEN (2 bytes, little-endian)
    output[outPos++] = blockSize & 0xff;
    output[outPos++] = (blockSize >> 8) & 0xff;
    // NLEN (one's complement of LEN)
    output[outPos++] = (~blockSize) & 0xff;
    output[outPos++] = ((~blockSize) >> 8) & 0xff;

    // Data
    output.set(data.subarray(inPos, inPos + blockSize), outPos);
    outPos += blockSize;
    inPos += blockSize;
  }

  // Adler-32 checksum
  const adler = adler32(data);
  output[outPos++] = (adler >> 24) & 0xff;
  output[outPos++] = (adler >> 16) & 0xff;
  output[outPos++] = (adler >> 8) & 0xff;
  output[outPos++] = adler & 0xff;

  return output.subarray(0, outPos);
}

/**
 * Adler-32 checksum for zlib.
 */
function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;

  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]!) % MOD;
    b = (b + a) % MOD;
  }

  return ((b << 16) | a) >>> 0;
}

/**
 * Creates an RGBA PNG image with a colored background and transparent center.
 * Used for testing image edit without a separate mask.
 */
function createRGBAImageWithTransparency(width: number, height: number): Image {
  const pixels = new Uint8Array(width * height * 4);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 3;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < radius) {
        // Transparent center (where edit will occur)
        pixels[idx] = 0;     // R
        pixels[idx + 1] = 0; // G
        pixels[idx + 2] = 0; // B
        pixels[idx + 3] = 0; // A (transparent)
      } else {
        // Red background (will be preserved)
        pixels[idx] = 255;     // R
        pixels[idx + 1] = 0;   // G
        pixels[idx + 2] = 0;   // B
        pixels[idx + 3] = 255; // A (opaque)
      }
    }
  }

  const pngBytes = encodePNG(pixels, width, height);
  return Image.fromBytes(pngBytes, 'image/png');
}

/**
 * Prompt Input Tests
 */
describe.skipIf(!HAS_OPENAI_KEY)('Prompt Input Formats', () => {
  test('accepts string prompt', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL_DALLE2),
      params: { size: '256x256' },
    });

    const result = await imageGen.generate('A test');

    expect(result.images).toHaveLength(1);
  }, 60000);

  test('accepts object prompt', async () => {
    const imageGen = image<OpenAIImageParams>({
      model: openai(OPENAI_MODEL_DALLE2),
      params: { size: '256x256' },
    });

    const result = await imageGen.generate({ prompt: 'A test' });

    expect(result.images).toHaveLength(1);
  }, 60000);
});
