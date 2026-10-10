import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount rendered components between tests (automatic only when Vitest globals are enabled).
afterEach(() => cleanup());
