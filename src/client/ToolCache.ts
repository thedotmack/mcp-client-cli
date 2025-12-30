import { MCPClient } from './MCPClient.js';
import type { Tool } from '../types/mcp.js';
import type { ServerConfig } from '../config/loader.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface CacheEntry {
  tools: Tool[];
  timestamp: number;
  serverConfig: ServerConfig;
}

export class ToolCache {
  private cachePath: string;
  private cache: Record<string, CacheEntry> = {};
  private ttl: number = 24 * 60 * 60 * 1000; // 24시간

  constructor(cachePath?: string) {
    this.cachePath = cachePath || join(homedir(), '.mcp-cli-cache.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (existsSync(this.cachePath)) {
      try {
        const data = readFileSync(this.cachePath, 'utf-8');
        this.cache = JSON.parse(data);
      } catch (error) {
        // 캐시 파일 손상 시 무시
        this.cache = {};
      }
    }
  }

  private saveToDisk(): void {
    try {
      writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error('Failed to save tool cache:', error);
    }
  }

  private isFresh(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < this.ttl;
  }

  async getOrFetch(serverName: string, serverConfig: ServerConfig): Promise<Tool[]> {
    const cached = this.cache[serverName];

    // 캐시가 있고 신선하면 반환 (연결 안 함!)
    if (cached && this.isFresh(cached)) {
      console.log(`Using cached tools for ${serverName}`);
      return cached.tools;
    }

    // 캐시 없으면 한 번만 연결해서 가져옴
    console.log(`Fetching tools for ${serverName}...`);
    const client = new MCPClient(serverConfig);

    try {
      await client.connect();
      const tools = await client.listTools();
      await client.disconnect();

      // 캐시 저장
      this.cache[serverName] = {
        tools,
        timestamp: Date.now(),
        serverConfig
      };
      this.saveToDisk();

      return tools;
    } catch (error) {
      await client.disconnect();
      throw error;
    }
  }

  invalidate(serverName: string): void {
    delete this.cache[serverName];
    this.saveToDisk();
  }

  clear(): void {
    this.cache = {};
    this.saveToDisk();
  }
}
