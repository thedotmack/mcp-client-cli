import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type {
  MCPRequest,
  MCPResponse,
  MCPNotification,
  ServerCapabilities,
  Tool,
  InitializeResult
} from '../types/mcp.js';

export interface MCPClientConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  clientName?: string;
  clientVersion?: string;
}

/**
 * Generic MCP Client for connecting to any MCP server
 */
export class MCPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number | string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();
  private buffer = '';
  private initialized = false;
  private serverCapabilities: ServerCapabilities = {};
  private config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    super();
    this.config = {
      clientName: 'mcp-client-cli',
      clientVersion: '0.1.0',
      ...config
    };
  }

  /**
   * Start the MCP server and initialize the connection
   */
  async connect(): Promise<InitializeResult> {
    if (this.process) {
      throw new Error('Client already connected');
    }

    // Spawn the MCP server process
    this.process = spawn(this.config.command, this.config.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.config.env }
    });

    // Handle stdout data
    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data);
    });

    // Handle stderr (suppress INFO logs, only show actual errors)
    this.process.stderr?.on('data', (data: Buffer) => {
      const message = data.toString();
      // Ignore common info messages (telemetry, etc)
      if (message.includes('INFO') && (message.includes('telemetry') || message.includes('Anonymized'))) {
        return;
      }
      // Only log/emit actual errors
      if (message.includes('ERROR') || message.includes('Error:')) {
        console.error('MCP Server Error:', message);
        this.emit('error', new Error(message));
      }
    });

    // Handle process exit (suppress stderr message for expected termination)
    this.process.on('exit', (code) => {
      // Don't log expected termination (0 = success, 143 = SIGTERM, null = killed)
      if (code !== null && code !== 0 && code !== 143) {
        console.log(`MCP Server exited with code ${code}`);
      }
      this.emit('exit', code);
      this.cleanup();
    });

    // Initialize the MCP connection
    return await this.initialize();
  }

  /**
   * Handle incoming data from the server
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    // Process complete JSON-RPC messages
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', line, error);
        }
      }
    }
  }

  /**
   * Handle a parsed JSON-RPC message
   */
  private handleMessage(message: MCPResponse | MCPNotification): void {
    // Check if it's a response to a request
    if ('id' in message) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else {
      // It's a notification
      this.emit('notification', message);
    }
  }

  /**
   * Send a request to the server
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Not connected to server');
    }

    const id = ++this.requestId;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(message, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  /**
   * Initialize the MCP connection
   */
  private async initialize(): Promise<InitializeResult> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
        sampling: {}
      },
      clientInfo: {
        name: this.config.clientName,
        version: this.config.clientVersion
      }
    });

    this.serverCapabilities = result.capabilities || {};
    this.initialized = true;

    // Send initialized notification
    await this.sendNotification('notifications/initialized');

    return result;
  }

  /**
   * Send a notification to the server (no response expected)
   */
  private async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Not connected to server');
    }

    const notification: MCPNotification = {
      jsonrpc: '2.0',
      method,
      params
    };

    const message = JSON.stringify(notification) + '\n';
    this.process.stdin.write(message);
  }

  /**
   * List all available tools from the server
   */
  async listTools(): Promise<Tool[]> {
    if (!this.initialized) {
      throw new Error('Client not initialized');
    }

    const result = await this.sendRequest('tools/list');
    return result.tools || [];
  }

  /**
   * Call a tool with the given arguments
   */
  async callTool(name: string, args: any): Promise<any> {
    if (!this.initialized) {
      throw new Error('Client not initialized');
    }

    return await this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (this.process) {
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error('Client disconnected'));
      }
      this.pendingRequests.clear();

      // Try graceful shutdown first
      this.process.kill('SIGTERM');

      // Force kill after 1 second if still running
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 1000);

        this.process?.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.cleanup();
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.process = null;
    this.initialized = false;
    this.buffer = '';
    this.pendingRequests.clear();
  }
}
