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

    const withPackages = tools.codeExecution({
      pip_packages: ['numpy', 'pandas'],
    });
    expect(withPackages.container?.pip_packages).toEqual(['numpy', 'pandas']);
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
