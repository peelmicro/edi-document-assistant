import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnalysisStream } from './use-analysis-stream';

// ── Minimal EventSource mock ──────────────────────────────────────────────────
// jsdom does not ship a real EventSource. We create a controllable fake that
// lets individual tests fire events and inspect the hook's state transitions.

type Listener = (event: Event) => void;

class FakeEventSource {
  static instance: FakeEventSource | null = null;
  readonly url: string;
  private listeners: Map<string, Listener[]> = new Map();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instance = this;
  }

  addEventListener(type: string, handler: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(handler);
  }

  /** Helper used by tests to fire a named SSE event with a JSON payload. */
  emit(type: string, data?: unknown) {
    const event =
      data !== undefined
        ? Object.assign(new Event(type), { data: JSON.stringify(data) })
        : new Event(type);
    this.listeners.get(type)?.forEach((h) => h(event));
  }
}

vi.stubGlobal('EventSource', FakeEventSource);

// Also mock the api helper so it returns a predictable URL
vi.mock('@/lib/api', () => ({
  streamAnalysisUrl: (code: string, provider: string, model: string) =>
    `/api/stream/${code}?provider=${provider}&model=${model}`,
}));

describe('useAnalysisStream', () => {
  beforeEach(() => {
    FakeEventSource.instance = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts in idle state when params are null', () => {
    const { result } = renderHook(() => useAnalysisStream(null, null, null));
    expect(result.current.status).toBe('idle');
    expect(result.current.text).toBe('');
    expect(result.current.savedAnalysisId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('moves to "streaming" after the started event', () => {
    const { result } = renderHook(() =>
      useAnalysisStream('DOC-001', 'anthropic', 'claude-haiku-4-5'),
    );

    act(() => {
      FakeEventSource.instance!.emit('started');
    });

    expect(result.current.status).toBe('streaming');
  });

  it('accumulates tokens in text', () => {
    const { result } = renderHook(() =>
      useAnalysisStream('DOC-001', 'anthropic', 'claude-haiku-4-5'),
    );

    act(() => {
      FakeEventSource.instance!.emit('started');
      FakeEventSource.instance!.emit('token', { token: 'Hello' });
      FakeEventSource.instance!.emit('token', { token: ' world' });
    });

    expect(result.current.text).toBe('Hello world');
  });

  it('transitions to "completed" and sets savedAnalysisId on analysis-saved', () => {
    const { result } = renderHook(() =>
      useAnalysisStream('DOC-001', 'anthropic', 'claude-haiku-4-5'),
    );

    act(() => {
      FakeEventSource.instance!.emit('started');
      FakeEventSource.instance!.emit('token', { token: 'some content' });
      FakeEventSource.instance!.emit('analysis-saved', { analysisId: 'ana-uuid-1' });
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.savedAnalysisId).toBe('ana-uuid-1');
    expect(FakeEventSource.instance!.close).toHaveBeenCalled();
  });

  it('transitions to "error" on a server-sent error event with a message', () => {
    const { result } = renderHook(() =>
      useAnalysisStream('DOC-001', 'anthropic', 'claude-haiku-4-5'),
    );

    act(() => {
      FakeEventSource.instance!.emit('error', { message: 'LLM quota exceeded' });
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('LLM quota exceeded');
  });

  it('sets "Connection lost" on a network-level error (no data)', () => {
    const { result } = renderHook(() =>
      useAnalysisStream('DOC-001', 'anthropic', 'claude-haiku-4-5'),
    );

    act(() => {
      // Emit a plain error with no .data (simulates a network drop)
      FakeEventSource.instance!.emit('error');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Connection lost');
  });

  it('cancel() closes the EventSource', () => {
    const { result } = renderHook(() =>
      useAnalysisStream('DOC-001', 'anthropic', 'claude-haiku-4-5'),
    );

    act(() => {
      result.current.cancel();
    });

    expect(FakeEventSource.instance!.close).toHaveBeenCalled();
  });

  it('closes the EventSource on unmount', () => {
    const { unmount } = renderHook(() =>
      useAnalysisStream('DOC-001', 'anthropic', 'claude-haiku-4-5'),
    );

    unmount();

    expect(FakeEventSource.instance!.close).toHaveBeenCalled();
  });
});
