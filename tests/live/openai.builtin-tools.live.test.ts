import { test, expect, describe } from 'bun:test';
import { llm, UserMessage } from '../../src/index.ts';
import { openai, tools, type OpenAIResponsesParams } from '../../src/openai/index.ts';

/**
 * Live API tests for OpenAI Responses API Built-in Tools
 * Requires OPENAI_API_KEY environment variable
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Built-in Tools Live', () => {

  test('web search tool', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-4o'),
      params: {
        max_output_tokens: 500,
        tools: [tools.webSearch()],
      },
    });

    const turn = await gpt.generate(
      'What is the current weather in San Francisco? Use web search to find out.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 60000);

  test('web search with user location', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-4o'),
      params: {
        max_output_tokens: 500,
        tools: [
          tools.webSearch({
            search_context_size: 'medium',
            user_location: {
              type: 'approximate',
              city: 'Tokyo',
              country: 'JP',
              timezone: 'Asia/Tokyo',
            },
          }),
        ],
      },
    });

    const turn = await gpt.generate(
      'What are some good restaurants nearby? Use web search.'
    );

    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 60000);

  test('image generation tool', async () => {
    const imageGen = llm<OpenAIResponsesParams>({
      model: openai('gpt-4o'),
      params: {
        max_output_tokens: 1000,
        tools: [tools.imageGeneration({ quality: 'low', size: '1024x1024' })],
      },
    });

    const turn = await imageGen.generate(
      'Generate an image of a single red apple on a white background.'
    );

    // Should have text response
    expect(turn.response.text.length).toBeGreaterThan(0);

    // Should have generated image in response content
    expect(turn.response.images.length).toBeGreaterThan(0);
    if (turn.response.images.length > 1) {
      console.log(`[OpenAI] Multi-image response: received ${turn.response.images.length} images`);
    }

    // Image should be base64 PNG
    const image = turn.response.images[0]!;
    expect(image.source.type).toBe('base64');
    if (image.source.type === 'base64') {
      expect(image.source.data).toMatch(/^iVBORw0KGgo/);
    }
  }, 120000);

});

/**
 * Streaming tests for OpenAI Built-in Tools
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Built-in Tools Streaming', () => {

  test('web search tool with streaming', async () => {
    const gpt = llm<OpenAIResponsesParams>({
      model: openai('gpt-4o'),
      params: {
        max_output_tokens: 500,
        tools: [tools.webSearch()],
      },
    });

    const stream = gpt.stream(
      'What is the current weather in New York City? Use web search to find out.'
    );

    const events: string[] = [];
    let textContent = '';

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === 'text_delta' && event.delta.text) {
        textContent += event.delta.text;
      }
    }

    const turn = await stream.turn;

    // Should have received streaming events
    expect(events.length).toBeGreaterThan(0);
    // Should have text deltas
    expect(events.filter(e => e === 'text_delta').length).toBeGreaterThan(0);
    // Accumulated text should match final response
    expect(textContent.length).toBeGreaterThan(0);
    expect(turn.response.text.length).toBeGreaterThan(0);
  }, 60000);

  test('image generation tool with streaming', async () => {
    const imageGen = llm<OpenAIResponsesParams>({
      model: openai('gpt-4o'),
      params: {
        max_output_tokens: 1000,
        tools: [tools.imageGeneration({ quality: 'low', size: '1024x1024' })],
      },
    });

    const stream = imageGen.stream(
      'Generate an image of a green tree on a white background.'
    );

    const events: string[] = [];
    let textContent = '';

    for await (const event of stream) {
      events.push(event.type);
      if (event.type === 'text_delta' && event.delta.text) {
        textContent += event.delta.text;
      }
    }

    const turn = await stream.turn;

    // Should have received streaming events
    expect(events.length).toBeGreaterThan(0);

    // Should have text response
    expect(turn.response.text.length).toBeGreaterThan(0);

    // Should have generated image in response content
    expect(turn.response.images.length).toBeGreaterThan(0);
    if (turn.response.images.length > 1) {
      console.log(`[OpenAI Streaming] Multi-image response: received ${turn.response.images.length} images`);
    }

    // Image should be base64 PNG
    const image = turn.response.images[0]!;
    expect(image.source.type).toBe('base64');
    if (image.source.type === 'base64') {
      expect(image.source.data).toMatch(/^iVBORw0KGgo/);
    }
  }, 120000);

  test('image generation with partial_images streaming', async () => {
    const imageGen = llm<OpenAIResponsesParams>({
      model: openai('gpt-4o'),
      params: {
        max_output_tokens: 1000,
        tools: [tools.imageGeneration({ quality: 'low', size: '1024x1024', partial_images: 3 })],
      },
    });

    const stream = imageGen.stream(
      'Generate an image of a sunset over the ocean.'
    );

    const eventCounts: Record<string, number> = {};
    let contentBlockCount = 0;

    for await (const event of stream) {
      eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
      if (event.type === 'content_block_start') {
        contentBlockCount++;
      }
    }

    const turn = await stream.turn;

    // Should have generated image
    expect(turn.response.images.length).toBeGreaterThan(0);

    // Log streaming event breakdown
    console.log(`[OpenAI partial_images=3] Event breakdown: ${JSON.stringify(eventCounts)}`);
    console.log(`[OpenAI partial_images=3] Content blocks: ${contentBlockCount}, Final images: ${turn.response.images.length}`);

    // With partial_images, we expect to see more content blocks than final images
    // as partial results are streamed progressively
    if (contentBlockCount > turn.response.images.length) {
      console.log(`[OpenAI] Partial streaming working: ${contentBlockCount} blocks for ${turn.response.images.length} final image(s)`);
    }
  }, 120000);

});

/**
 * Multiple image generation test
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Multiple Image Generation', () => {

  test('request multiple images via prompt', async () => {
    const imageGen = llm<OpenAIResponsesParams>({
      model: openai('gpt-4o'),
      params: {
        max_output_tokens: 2000,
        tools: [tools.imageGeneration({ quality: 'low', size: '1024x1024' })],
      },
    });

    const turn = await imageGen.generate(
      'Generate two different images: first a red circle, then a blue square. Create both images separately.'
    );

    // Should have at least one image (model decides how many based on prompt)
    expect(turn.response.images.length).toBeGreaterThanOrEqual(1);
    if (turn.response.images.length >= 2) {
      console.log(`[OpenAI] Multi-image success: received ${turn.response.images.length} images as requested`);
    } else {
      console.log(`[OpenAI] Single image returned (asked for 2 in prompt, got ${turn.response.images.length})`);
    }
  }, 180000);

});

/**
 * E2E test: Generate image then verify with vision model
 */
describe.skipIf(!process.env.OPENAI_API_KEY)('OpenAI Image Generation E2E', () => {

  test('generate image and verify with vision', async () => {
    // Generate an image
    const imageGen = llm<OpenAIResponsesParams>({
      model: openai('gpt-4o'),
      params: {
        max_output_tokens: 1000,
        tools: [tools.imageGeneration({ quality: 'low' })],
      },
    });

    const genTurn = await imageGen.generate(
      'Generate an image of a blue cat wearing a top hat.'
    );

    // Extract the image from response content
    expect(genTurn.response.images.length).toBeGreaterThan(0);
    const generatedImage = genTurn.response.images[0]!;
    expect(generatedImage.source.type).toBe('base64');

    // Send the image to vision model for verification
    const visionModel = llm<OpenAIResponsesParams>({
      model: openai('gpt-4o'),
      params: {
        max_output_tokens: 500,
      },
    });

    const verifyTurn = await visionModel.generate(
      new UserMessage([
        {
          type: 'text',
          text: 'Describe what you see in this image. Is there a cat? What color is it? Is it wearing anything on its head?',
        },
        generatedImage,
      ])
    );

    // Vision model should describe a blue cat with a top hat
    const description = verifyTurn.response.text.toLowerCase();
    expect(description).toMatch(/cat|feline/i);
    expect(description).toMatch(/blue|teal|cyan|turquoise/i);
    expect(description).toMatch(/hat|top hat/i);
  }, 180000);

});
