import { vi } from 'vitest'

vi.mock('@/db', () => ({ db: {} }))
vi.mock('server-only', () => ({}))