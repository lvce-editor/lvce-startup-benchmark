import type { Server } from 'node:http'

export const createBaselineServer: () => Server

export const startBaselineServer: (port: number) => Promise<void>
