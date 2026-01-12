import { test, expect, describe } from 'bun:test';

// ============================================
// Anthropic Built-in Tools Tests
// ============================================

describe('Anthropic Built-in Tools', () => {
  test('webSearchTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/anthropic/types.ts');

    const basic = tools.webSearch();
    expect(basic.type).toBe('web_search_20250305');
    expect(basic.name).toBe('web_search');

    const withOptions = tools.webSearch({
      max_uses: 5,
      allowed_domains: ['wikipedia.org', 'github.com'],
      user_location: {
        type: 'approximate',
        city: 'San Francisco',
        country: 'US',
      },
    });
    expect(withOptions.max_uses).toBe(5);
    expect(withOptions.allowed_domains).toEqual(['wikipedia.org', 'github.com']);
    expect(withOptions.user_location?.city).toBe('San Francisco');
  });

  test('computerTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/anthropic/types.ts');

    const basic = tools.computer({
      display_width_px: 1920,
      display_height_px: 1080,
    });
    expect(basic.type).toBe('computer_20250124');
    expect(basic.name).toBe('computer');
    expect(basic.display_width_px).toBe(1920);
    expect(basic.display_height_px).toBe(1080);

    const opus = tools.computer({
      display_width_px: 1920,
      display_height_px: 1080,
      version: '20251124',
      enable_zoom: true,
    });
    expect(opus.type).toBe('computer_20251124');
    expect(opus.enable_zoom).toBe(true);
  });

  test('textEditorTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/anthropic/types.ts');

    const basic = tools.textEditor();
    expect(basic.type).toBe('text_editor_20250728');
    expect(basic.name).toBe('str_replace_based_edit_tool');

    const withLimit = tools.textEditor({ max_characters: 10000 });
    expect(withLimit.max_characters).toBe(10000);

    const legacyVersion = tools.textEditor({ version: '20250124' });
    expect(legacyVersion.type).toBe('text_editor_20250124');
    expect(legacyVersion.name).toBe('str_replace_editor');
  });

  test('bashTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/anthropic/types.ts');

    const bash = tools.bash();
    expect(bash.type).toBe('bash_20250124');
    expect(bash.name).toBe('bash');
  });

  test('codeExecutionTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/anthropic/types.ts');

    const codeExec = tools.codeExecution();
    expect(codeExec.type).toBe('code_execution_20250825');
    expect(codeExec.name).toBe('code_execution');
  });

  test('toolSearchTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/anthropic/types.ts');

    const regexSearch = tools.toolSearch();
    expect(regexSearch.type).toBe('tool_search_tool_regex_20251119');
    expect(regexSearch.name).toBe('tool_search_tool_regex');

    const bm25Search = tools.toolSearch({ mode: 'bm25' });
    expect(bm25Search.type).toBe('tool_search_tool_bm25_20251119');
    expect(bm25Search.name).toBe('tool_search_tool_bm25');
  });

  test('tools namespace exports all constructors', async () => {
    const { tools } = await import('../../../src/providers/anthropic/types.ts');

    expect(typeof tools.webSearch).toBe('function');
    expect(typeof tools.computer).toBe('function');
    expect(typeof tools.textEditor).toBe('function');
    expect(typeof tools.bash).toBe('function');
    expect(typeof tools.codeExecution).toBe('function');
    expect(typeof tools.toolSearch).toBe('function');
  });
});

// ============================================
// Google Built-in Tools Tests
// ============================================

describe('Google Built-in Tools', () => {
  test('googleSearchTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/google/types.ts');

    const search = tools.googleSearch();
    expect(search.googleSearch).toEqual({});
  });

  test('codeExecutionTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/google/types.ts');

    const codeExec = tools.codeExecution();
    expect(codeExec.codeExecution).toEqual({});
  });

  test('urlContextTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/google/types.ts');

    const urlCtx = tools.urlContext();
    expect(urlCtx.urlContext).toEqual({});
  });

  test('googleMapsTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/google/types.ts');

    const basic = tools.googleMaps();
    expect(basic.googleMaps).toEqual({});

    const withWidget = tools.googleMaps({ enableWidget: true });
    expect(withWidget.googleMaps.enableWidget).toBe(true);
  });

  test('fileSearchTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/google/types.ts');

    const fileSearch = tools.fileSearch({
      fileSearchStoreNames: ['fileSearchStores/abc123'],
    });
    expect(fileSearch.fileSearch.fileSearchStoreNames).toEqual(['fileSearchStores/abc123']);

    const withFilter = tools.fileSearch({
      fileSearchStoreNames: ['fileSearchStores/abc123'],
      metadataFilter: 'status="active"',
    });
    expect(withFilter.fileSearch.metadataFilter).toBe('status="active"');
  });

  test('tools namespace exports all constructors', async () => {
    const { tools } = await import('../../../src/providers/google/types.ts');

    expect(typeof tools.googleSearch).toBe('function');
    expect(typeof tools.codeExecution).toBe('function');
    expect(typeof tools.urlContext).toBe('function');
    expect(typeof tools.googleMaps).toBe('function');
    expect(typeof tools.fileSearch).toBe('function');
  });
});

// ============================================
// xAI Built-in Tools Tests
// ============================================

describe('xAI Built-in Tools', () => {
  test('webSearchTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/xai/types.ts');

    const basic = tools.webSearch();
    expect(basic.type).toBe('web_search');

    const withOptions = tools.webSearch({
      allowed_domains: ['wikipedia.org', 'github.com'],
      enable_image_understanding: true,
    });
    expect(withOptions.allowed_domains).toEqual(['wikipedia.org', 'github.com']);
    expect(withOptions.enable_image_understanding).toBe(true);
  });

  test('xSearchTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/xai/types.ts');

    const basic = tools.xSearch();
    expect(basic.type).toBe('x_search');

    const withOptions = tools.xSearch({
      allowed_x_handles: ['elonmusk', 'xai'],
      from_date: '2025-01-01',
      to_date: '2025-12-31',
      enable_video_understanding: true,
    });
    expect(withOptions.allowed_x_handles).toEqual(['elonmusk', 'xai']);
    expect(withOptions.from_date).toBe('2025-01-01');
    expect(withOptions.to_date).toBe('2025-12-31');
    expect(withOptions.enable_video_understanding).toBe(true);
  });

  test('codeExecutionTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/xai/types.ts');

    const basic = tools.codeExecution();
    expect(basic.type).toBe('code_interpreter');
  });

  test('fileSearchTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/xai/types.ts');

    const basic = tools.fileSearch({
      vector_store_ids: ['vs_abc123'],
    });
    expect(basic.type).toBe('file_search');
    expect(basic.vector_store_ids).toEqual(['vs_abc123']);

    const withOptions = tools.fileSearch({
      vector_store_ids: ['vs_abc123'],
      max_num_results: 10,
      retrieval_mode: 'hybrid',
    });
    expect(withOptions.max_num_results).toBe(10);
    expect(withOptions.retrieval_mode?.type).toBe('hybrid');
  });

  test('mcpTool creates correct configuration', async () => {
    const { tools } = await import('../../../src/providers/xai/types.ts');

    const mcp = tools.mcp({
      server_url: 'https://my-mcp-server.com/sse',
      server_label: 'my_tools',
      allowed_tool_names: ['get_weather', 'search_db'],
    });
    expect(mcp.type).toBe('mcp');
    expect(mcp.server_url).toBe('https://my-mcp-server.com/sse');
    expect(mcp.server_label).toBe('my_tools');
    expect(mcp.allowed_tool_names).toEqual(['get_weather', 'search_db']);
  });

  test('tools namespace exports all constructors', async () => {
    const { tools } = await import('../../../src/providers/xai/types.ts');

    expect(typeof tools.webSearch).toBe('function');
    expect(typeof tools.xSearch).toBe('function');
    expect(typeof tools.codeExecution).toBe('function');
    expect(typeof tools.fileSearch).toBe('function');
    expect(typeof tools.mcp).toBe('function');
  });
});

// ============================================
// Index Export Tests
// ============================================

describe('Provider Index Exports', () => {
  test('anthropic exports tools namespace', async () => {
    const { tools } = await import('../../../src/providers/anthropic/index.ts');
    expect(tools).toBeDefined();
    expect(typeof tools.webSearch).toBe('function');
  });

  test('anthropic exports betas namespace with all known betas', async () => {
    const { betas } = await import('../../../src/providers/anthropic/index.ts');
    expect(betas).toBeDefined();

    // Structured Outputs
    expect(betas.structuredOutputs).toBe('structured-outputs-2025-11-13');

    // Extended Thinking / Reasoning
    expect(betas.interleavedThinking).toBe('interleaved-thinking-2025-05-14');
    expect(betas.devFullThinking).toBe('dev-full-thinking-2025-05-14');
    expect(betas.effort).toBe('effort-2025-11-24');

    // Computer Use
    expect(betas.computerUseLegacy).toBe('computer-use-2024-10-22');
    expect(betas.computerUse).toBe('computer-use-2025-01-24');
    expect(betas.computerUseOpus).toBe('computer-use-2025-11-24');

    // Extended Output / Context
    expect(betas.maxTokens35Sonnet).toBe('max-tokens-3-5-sonnet-2024-07-15');
    expect(betas.output128k).toBe('output-128k-2025-02-19');
    expect(betas.context1m).toBe('context-1m-2025-08-07');

    // Token Efficiency
    expect(betas.tokenEfficientTools).toBe('token-efficient-tools-2025-02-19');
    expect(betas.fineGrainedToolStreaming).toBe('fine-grained-tool-streaming-2025-05-14');

    // Code Execution
    expect(betas.codeExecution).toBe('code-execution-2025-08-25');

    // Advanced Tool Use
    expect(betas.advancedToolUse).toBe('advanced-tool-use-2025-11-20');

    // Files & Documents
    expect(betas.filesApi).toBe('files-api-2025-04-14');
    expect(betas.pdfs).toBe('pdfs-2024-09-25');

    // MCP
    expect(betas.mcpClient).toBe('mcp-client-2025-04-04');
    expect(betas.mcpClientLatest).toBe('mcp-client-2025-11-20');

    // Caching
    expect(betas.promptCaching).toBe('prompt-caching-2024-07-31');
    expect(betas.extendedCacheTtl).toBe('extended-cache-ttl-2025-04-11');

    // Context Management
    expect(betas.contextManagement).toBe('context-management-2025-06-27');
    expect(betas.modelContextWindowExceeded).toBe('model-context-window-exceeded-2025-08-26');

    // Message Batches
    expect(betas.messageBatches).toBe('message-batches-2024-09-24');

    // Token Counting
    expect(betas.tokenCounting).toBe('token-counting-2024-11-01');

    // Skills
    expect(betas.skills).toBe('skills-2025-10-02');
  });

  test('all betas values are non-empty strings', async () => {
    const { betas } = await import('../../../src/providers/anthropic/index.ts');
    const betaKeys = Object.keys(betas) as Array<keyof typeof betas>;

    expect(betaKeys.length).toBeGreaterThanOrEqual(25);

    for (const key of betaKeys) {
      expect(typeof betas[key]).toBe('string');
      expect(betas[key].length).toBeGreaterThan(0);
      // Verify beta format: name-YYYY-MM-DD
      expect(betas[key]).toMatch(/^[\w-]+-\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('anthropic provider accepts betas option', async () => {
    const { anthropic, betas } = await import('../../../src/providers/anthropic/index.ts');

    // Without betas
    const basicModel = anthropic('claude-sonnet-4-20250514');
    expect(basicModel.modelId).toBe('claude-sonnet-4-20250514');
    expect(basicModel.providerConfig).toBeUndefined();

    // With single beta
    const modelWithBeta = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.structuredOutputs],
    });
    expect(modelWithBeta.providerConfig?.headers?.['anthropic-beta']).toBe('structured-outputs-2025-11-13');

    // With multiple betas
    const modelWithBetas = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.structuredOutputs, betas.interleavedThinking],
    });
    expect(modelWithBetas.providerConfig?.headers?.['anthropic-beta']).toBe(
      'structured-outputs-2025-11-13,interleaved-thinking-2025-05-14'
    );

    // With custom string beta
    const modelWithCustom = anthropic('claude-sonnet-4-20250514', {
      betas: ['custom-beta-2025-01-01'],
    });
    expect(modelWithCustom.providerConfig?.headers?.['anthropic-beta']).toBe('custom-beta-2025-01-01');
  });

  test('anthropic provider with empty betas array returns undefined providerConfig', async () => {
    const { anthropic } = await import('../../../src/providers/anthropic/index.ts');

    const model = anthropic('claude-sonnet-4-20250514', { betas: [] });
    expect(model.modelId).toBe('claude-sonnet-4-20250514');
    expect(model.providerConfig).toBeUndefined();
  });

  test('anthropic provider preserves beta order in header', async () => {
    const { anthropic, betas } = await import('../../../src/providers/anthropic/index.ts');

    // Order should be preserved exactly as provided
    const model = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.pdfs, betas.context1m, betas.structuredOutputs],
    });

    expect(model.providerConfig?.headers?.['anthropic-beta']).toBe(
      'pdfs-2024-09-25,context-1m-2025-08-07,structured-outputs-2025-11-13'
    );
  });

  test('anthropic provider handles duplicate betas in array', async () => {
    const { anthropic, betas } = await import('../../../src/providers/anthropic/index.ts');

    // Duplicates are preserved as-is (user responsibility)
    const model = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.structuredOutputs, betas.structuredOutputs],
    });

    expect(model.providerConfig?.headers?.['anthropic-beta']).toBe(
      'structured-outputs-2025-11-13,structured-outputs-2025-11-13'
    );
  });

  test('anthropic provider with mixed known and custom betas', async () => {
    const { anthropic, betas } = await import('../../../src/providers/anthropic/index.ts');

    const model = anthropic('claude-sonnet-4-20250514', {
      betas: [betas.structuredOutputs, 'my-custom-beta-2025-12-01', betas.codeExecution],
    });

    expect(model.providerConfig?.headers?.['anthropic-beta']).toBe(
      'structured-outputs-2025-11-13,my-custom-beta-2025-12-01,code-execution-2025-08-25'
    );
  });

  test('google exports tools namespace', async () => {
    const { tools } = await import('../../../src/providers/google/index.ts');
    expect(tools).toBeDefined();
    expect(typeof tools.googleSearch).toBe('function');
  });

  test('xai exports tools namespace', async () => {
    const { tools } = await import('../../../src/providers/xai/index.ts');
    expect(tools).toBeDefined();
    expect(typeof tools.webSearch).toBe('function');
  });
});
