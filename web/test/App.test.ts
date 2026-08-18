import { describe, it, expect } from 'vitest';
import { App } from '../src/App.js';

describe('App', () => {
  it('is a defined React component function', () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe('function');
  });
});
