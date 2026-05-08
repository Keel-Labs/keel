import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../../../shared/types';

const captureMock = vi.fn();
vi.mock('../capture', () => ({
  capture: (...args: unknown[]) => captureMock(...args),
}));

import { autoCapture, _resetAutoCaptureStateForTests } from '../autoCapture';

const SUBSTANTIAL = `We're standing up a new pool and hot tub maintenance project for the Sunnyvale property. The vendor is Bay Area Pool Co., weekly visits on Tuesdays, contract value $4,200/year, primary contact is Jordan at 555-0142. They handle chemicals, filter cleaning, and seasonal hot tub winterization.`;

const TRIVIA = 'where is california';

function makeLLM(classifyResponse: string) {
  return {
    chat: vi.fn().mockResolvedValue(classifyResponse),
  } as unknown as Parameters<typeof autoCapture>[2];
}

const fmStub = {} as unknown as Parameters<typeof autoCapture>[1];

beforeEach(() => {
  captureMock.mockReset();
  captureMock.mockResolvedValue('captured: pool servicing');
  _resetAutoCaptureStateForTests();
});

describe('autoCapture', () => {
  it('captures a substantial new user message', async () => {
    const llm = makeLLM('{"shouldCapture": true, "reason": "project info"}');
    const messages: Message[] = [
      { role: 'user', content: SUBSTANTIAL, timestamp: 1 },
      { role: 'assistant', content: 'noted', timestamp: 2 },
    ];
    const r = await autoCapture(messages, fmStub, llm);
    expect(r.captured).toBe(true);
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock.mock.calls[0][0]).toBe(SUBSTANTIAL);
  });

  it('does NOT re-capture when a trivial message follows a substantial one (the repro)', async () => {
    const llm = makeLLM('{"shouldCapture": true, "reason": "project info"}');

    const turn1: Message[] = [
      { role: 'user', content: SUBSTANTIAL, timestamp: 100 },
      { role: 'assistant', content: 'noted', timestamp: 101 },
    ];
    const r1 = await autoCapture(turn1, fmStub, llm);
    expect(r1.captured).toBe(true);
    expect(captureMock).toHaveBeenCalledTimes(1);

    const turn2: Message[] = [
      ...turn1,
      { role: 'user', content: TRIVIA, timestamp: 200 },
      { role: 'assistant', content: 'California is on the US west coast.', timestamp: 201 },
    ];
    const r2 = await autoCapture(turn2, fmStub, llm);
    expect(r2.captured).toBe(false);
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it('skips question-shaped latest messages without calling the classifier', async () => {
    const llm = makeLLM('{"shouldCapture": true}');
    const messages: Message[] = [
      { role: 'user', content: 'Where is California located and what are its biggest cities, including the Bay Area?', timestamp: 1 },
    ];
    const r = await autoCapture(messages, fmStub, llm);
    expect(r.captured).toBe(false);
    expect((llm as unknown as { chat: ReturnType<typeof vi.fn> }).chat).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('skips short messages', async () => {
    const llm = makeLLM('{"shouldCapture": true}');
    const messages: Message[] = [
      { role: 'user', content: 'hello there', timestamp: 1 },
    ];
    const r = await autoCapture(messages, fmStub, llm);
    expect(r.captured).toBe(false);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('does not re-capture the same message on a duplicate invocation', async () => {
    const llm = makeLLM('{"shouldCapture": true, "reason": "project info"}');
    const messages: Message[] = [
      { role: 'user', content: SUBSTANTIAL, timestamp: 42 },
    ];
    const r1 = await autoCapture(messages, fmStub, llm);
    const r2 = await autoCapture(messages, fmStub, llm);
    expect(r1.captured).toBe(true);
    expect(r2.captured).toBe(false);
    expect(captureMock).toHaveBeenCalledTimes(1);
  });
});
