// centrifugo-test-server.ts
import express from 'express';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = 3000;

// ========== CONFIGURATION ==========
const CONFIG = {
  // Centrifugo server
  CENTRIFUGO_URL: 'http://localhost:8000',
  CENTRIFUGO_API_KEY: 'api-key',
  CENTRIFUGO_SECRET: 'your-centrifugo-secret',

  // JWT settings
  JWT_SECRET: 'your-jwt-secret-key-change-this',
  TOKEN_EXPIRY: '24h',

  // Rate limiting
  MAX_SUBSCRIPTIONS_PER_USER: 100
};

// ========== TYPES ==========
interface User {
  id: string;
  name: string;
  role: 'admin' | 'moderator' | 'member' | 'guest';
  rooms: string[];
  permissions: string[];
}

interface CentrifugoToken {
  sub: string;           // User ID
  exp: number;           // Expiration
  iat: number;           // Issued at
  info: {
    name: string;
    role: string;
  };
  channels?: string[];   // Allowed channels (optional - server-side validation preferred)
  caps?: Record<string, string[]>; // Per-channel capabilities
}

interface CentrifugoProxyRequest {
  method: 'publish' | 'subscribe' | 'presence' | 'history' | 'refresh';
  params: {
    channel?: string;
    data?: any;
    client?: string;
    user?: string;
  };
  client: string;
  transport: string;
  protocol: string;
  encoding: string;
}

// ========== DATABASE MOCK ==========
class MockDatabase {
  private users = new Map<string, User>();
  private rooms = new Map<string, { id: string; name: string; members: string[] }>();
  private tokens = new Map<string, { userId: string; issuedAt: Date; expiresAt: Date }>();

  constructor() {
    // Seed test data
    this.seedTestData();
  }

  private seedTestData(): void {
    // Test users
    this.users.set('user_123', {
      id: 'user_123',
      name: 'John Doe',
      role: 'admin',
      rooms: ['room_1', 'room_2'],
      permissions: ['publish', 'subscribe', 'history']
    });

    this.users.set('user_456', {
      id: 'user_456',
      name: 'Jane Smith',
      role: 'member',
      rooms: ['room_456'],
      permissions: ['subscribe', 'history']
    });

    // Test rooms
    this.rooms.set('room_1', {
      id: 'room_1',
      name: 'General Chat',
      members: ['user_123', 'user_456']
    });

    this.rooms.set('room_2', {
      id: 'room_2',
      name: 'Admin Channel',
      members: ['user_123']
    });
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByToken(token: string): User | undefined {
    const tokenData = this.tokens.get(token);
    if (!tokenData) return undefined;
    return this.users.get(tokenData.userId);
  }

  validateRoomAccess(userId: string, roomId: string): boolean {
    const user = this.users.get(userId);
    return user?.rooms.includes(roomId) || false;
  }

  validateChannelAccess(userId: string, channel: string): boolean {
    // Parse channel pattern
    if (channel.startsWith('chat-global-events:')) {
      const channelUserId = channel.split(':')[1];
      return channelUserId === userId; // Users can only subscribe to their own global events
    }

    if (channel.startsWith('room-events:')) {
      const roomId = channel.split(':')[1];
      return this.validateRoomAccess(userId, roomId);
    }

    if (channel === 'chat-command-bus') {
      const user = this.users.get(userId);
      return user?.role === 'admin' || user?.role === 'moderator';
    }

    if (channel.startsWith('user-presence:')) {
      const targetUserId = channel.split(':')[1];
      // Users can see their own presence and public presence
      return targetUserId === userId || true; // In production, implement privacy settings
    }

    return false;
  }

  storeToken(token: string, userId: string, expiresAt: Date): void {
    this.tokens.set(token, { userId, issuedAt: new Date(), expiresAt });
  }

  revokeUserTokens(userId: string): void {
    for (const [token, data] of this.tokens.entries()) {
      if (data.userId === userId) {
        this.tokens.delete(token);
      }
    }
  }
}

// ========== CENTRIFUGO PROXY HANDLER ==========
class CentrifugoProxyHandler {
  constructor(private db: MockDatabase) {}

  /**
   * Handle Centrifugo proxy requests
   * https://centrifugal.dev/docs/server/proxy
   */
  async handleProxy(req: CentrifugoProxyRequest): Promise<any> {
    console.log(`🔄 Proxy request: ${req.method}`, {
      client: req.client,
      channel: req.params?.channel,
      user: req.params?.user
    });

    switch (req.method) {
      case 'subscribe':
        return this.handleSubscribe(req);
      case 'publish':
        return this.handlePublish(req);
      case 'presence':
        return this.handlePresence(req);
      case 'history':
        return this.handleHistory(req);
      case 'refresh':
        return this.handleRefresh(req);
      default:
        return { result: {} };
    }
  }

  /**
   * Handle subscription requests - VALIDATE PERMISSIONS HERE!
   */
  private async handleSubscribe(req: CentrifugoProxyRequest): Promise<any> {
    const { channel, user: userId, client } = req.params;

    if (!channel || !userId) {
      return {
        result: {},
        error: {
          code: 103,
          message: 'Missing channel or user'
        }
      };
    }

    // Validate channel format
    if (!this.isValidChannelFormat(channel)) {
      return {
        result: {},
        error: {
          code: 104,
          message: 'Invalid channel format'
        }
      };
    }

    // Check if user exists
    const user = this.db.getUser(userId);
    if (!user) {
      return {
        result: {},
        error: {
          code: 102,
          message: 'Unknown user'
        }
      };
    }

    // Validate access permissions
    const hasAccess = this.db.validateChannelAccess(userId, channel);

    if (!hasAccess) {
      console.warn(`⛔ Access denied: User ${userId} attempted to subscribe to ${channel}`);
      return {
        result: {},
        error: {
          code: 105,
          message: 'Access denied'
        }
      };
    }

    // Check subscription limits
    // Note: You'd need to track active subscriptions per user/client

    console.log(`✅ Subscription allowed: User ${userId} -> ${channel}`);

    // Return success with optional capabilities
    return {
      result: {
        channel_info: {
          user_id: userId,
          // Custom channel metadata
          name: this.getChannelName(channel),
          type: this.getChannelType(channel)
        },
        // Per-subscription capabilities
        caps: ['read', 'write'], // or ['read'] for read-only
        // Expire subscription in 1 hour
        expire_at: Math.floor(Date.now() / 1000) + 3600
      }
    };
  }

  /**
   * Handle publish requests - VALIDATE MESSAGES HERE!
   */
  private async handlePublish(req: CentrifugoProxyRequest): Promise<any> {
    const { channel, data, user: userId } = req.params;

    if (!channel || !data) {
      return {
        result: {},
        error: {
          code: 103,
          message: 'Missing channel or data'
        }
      };
    }

    // Validate user has publish permission for this channel
    const user = this.db.getUser(userId!);
    if (!user) {
      return {
        result: {},
        error: {
          code: 102,
          message: 'Unknown user'
        }
      };
    }

    // Check publish permissions
    const canPublish = this.canPublishToChannel(userId!, channel);
    if (!canPublish) {
      return {
        result: {},
        error: {
          code: 106,
          message: 'Publish not allowed'
        }
      };
    }

    // Validate message payload
    const validation = this.validateMessagePayload(data);
    if (!validation.valid) {
      return {
        result: {},
        error: {
          code: 107,
          message: validation.error
        }
      };
    }

    // Sanitize message
    const sanitizedData = this.sanitizeMessage(data);

    // Rate limiting check (simplified)
    // In production, use Redis for rate limiting

    console.log(`📨 Publishing to ${channel}:`, sanitizedData);

    // Allow the publish with modified data
    return {
      result: {
        data: sanitizedData,
        skip_history: false,
        // Custom tags for audit
        tags: {
          user_id: userId,
          timestamp: Date.now().toString(),
          channel_type: this.getChannelType(channel)
        }
      }
    };
  }

  /**
   * Handle presence requests
   */
  private async handlePresence(req: CentrifugoProxyRequest): Promise<any> {
    // Control who can see presence information
    return { result: {} };
  }

  /**
   * Handle history requests
   */
  private async handleHistory(req: CentrifugoProxyRequest): Promise<any> {
    // Control who can read message history
    return { result: {} };
  }

  /**
   * Handle token refresh
   */
  private async handleRefresh(req: CentrifugoProxyRequest): Promise<any> {
    const { user: userId } = req.params;

    // Check if user is still active/allowed
    const user = this.db.getUser(userId!);
    if (!user) {
      return {
        result: {},
        error: {
          code: 102,
          message: 'User not found'
        }
      };
    }

    // Issue new token expiry
    return {
      result: {
        expire_at: Math.floor(Date.now() / 1000) + 86400, // 24 hours
        info: {
          name: user.name,
          role: user.role
        }
      }
    };
  }

  // ========== HELPER METHODS ==========

  private isValidChannelFormat(channel: string): boolean {
    // Centrifugo channel naming rules
    return channel.length <= 255 &&
      /^[a-zA-Z0-9\-_=@\.:;]+$/.test(channel) &&
      !channel.startsWith('centrifugo-');
  }

  private canPublishToChannel(userId: string, channel: string): boolean {
    const user = this.db.getUser(userId);
    if (!user) return false;

    // Only admins and moderators can publish to command bus
    if (channel === 'chat-command-bus') {
      return user.role === 'admin' || user.role === 'moderator';
    }

    // Users can publish to rooms they're members of
    if (channel.startsWith('room-events:')) {
      const roomId = channel.split(':')[1];
      return user.rooms.includes(roomId);
    }

    // Users can publish to their own global events channel
    if (channel.startsWith('chat-global-events:')) {
      const channelUserId = channel.split(':')[1];
      return channelUserId === userId;
    }

    return false;
  }

  private validateMessagePayload(data: any): { valid: boolean; error?: string } {
    // Check required fields
    if (!data) {
      return { valid: false, error: 'Empty message' };
    }

    // Size limit (e.g., 64KB)
    const size = JSON.stringify(data).length;
    if (size > 65536) {
      return { valid: false, error: 'Message too large' };
    }

    // Check for prohibited content
    if (data.text) {
      // Basic XSS prevention
      if (data.text.includes('<script') || data.text.includes('javascript:')) {
        return { valid: false, error: 'Prohibited content' };
      }
    }

    return { valid: true };
  }

  private sanitizeMessage(data: any): any {
    if (!data) return data;

    const sanitized = { ...data };

    // Sanitize text content
    if (sanitized.text) {
      sanitized.text = sanitized.text
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, 'blocked:')
        .trim();
    }

    // Add server metadata
    sanitized.server_timestamp = Date.now();
    sanitized.server_id = uuidv4();

    return sanitized;
  }

  private getChannelName(channel: string): string {
    if (channel.startsWith('room-events:')) {
      const roomId = channel.split(':')[1];
      return `Room ${roomId}`;
    }
    return channel;
  }

  private getChannelType(channel: string): string {
    if (channel.startsWith('room-events:')) return 'room';
    if (channel.startsWith('chat-global-events:')) return 'user';
    if (channel === 'chat-command-bus') return 'system';
    if (channel.startsWith('user-presence:')) return 'presence';
    return 'unknown';
  }
}

// ========== JWT TOKEN SERVICE ==========
class TokenService {
  constructor(private db: MockDatabase) {}

  /**
   * Generate Centrifugo connection token
   */
  generateConnectionToken(userId: string): { token: string; expiresAt: Date } {
    const user = this.db.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const payload: CentrifugoToken = {
      sub: userId,
      exp: Math.floor(expiresAt.getTime() / 1000),
      iat: Math.floor(Date.now() / 1000),
      info: {
        name: user.name,
        role: user.role
      }
      // Don't include channels in token - validate via proxy instead!
    };

    const token = jwt.sign(payload, CONFIG.JWT_SECRET);
    this.db.storeToken(token, userId, expiresAt);

    return { token, expiresAt };
  }

  /**
   * Generate subscription token for specific channel
   */
  generateSubscriptionToken(userId: string, channel: string): { token: string; expiresAt: Date } {
    // Validate user has access to this channel
    if (!this.db.validateChannelAccess(userId, channel)) {
      throw new Error('Access denied to channel');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Short-lived subscription tokens

    const payload = {
      sub: userId,
      channel,
      exp: Math.floor(expiresAt.getTime() / 1000),
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(payload, CONFIG.JWT_SECRET);
    return { token, expiresAt };
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token: string): any {
    try {
      return jwt.verify(token, CONFIG.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }
}

// ========== EXPRESS SERVER ==========
const db = new MockDatabase();
const tokenService = new TokenService(db);
const proxyHandler = new CentrifugoProxyHandler(db);

// Middleware
app.use(cors());
app.use(express.json());

// ========== API ENDPOINTS ==========

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    centrifugo: CONFIG.CENTRIFUGO_URL
  });
});

/**
 * Issue connection token for a user
 */
app.post('/api/token/connection', (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { token, expiresAt } = tokenService.generateConnectionToken(userId);

    res.json({
      token,
      expires_at: expiresAt.toISOString(),
      user_id: userId
    });
  } catch (error) {
    res.status(400).json({ error: 'error' });
  }
});

/**
 * Issue subscription token for a channel
 */
app.post('/api/token/subscription', (req, res) => {
  try {
    const { userId, channel } = req.body;

    if (!userId || !channel) {
      return res.status(400).json({ error: 'userId and channel are required' });
    }

    const { token, expiresAt } = tokenService.generateSubscriptionToken(userId, channel);

    res.json({
      token,
      expires_at: expiresAt.toISOString(),
      channel,
      user_id: userId
    });
  } catch (error) {
    res.status(400).json({ error: 'error.message' });
  }
});

/**
 * Revoke all tokens for a user
 */
app.post('/api/token/revoke', (req, res) => {
  try {
    const { userId } = req.body;
    db.revokeUserTokens(userId);
    res.json({ success: true, message: `Tokens revoked for user ${userId}` });
  } catch (error) {
    res.status(400).json({ error: 'error' });
  }
});

/**
 * Centrifugo proxy endpoint
 * https://centrifugal.dev/docs/server/proxy
 */
app.post('/api/centrifugo/proxy', async (req, res) => {
  try {
    const proxyRequest = req.body as CentrifugoProxyRequest;

    // Verify the request is from Centrifugo
    const centrifugoAuth = req.headers['x-centrifugo-proxy'];
    if (centrifugoAuth !== CONFIG.CENTRIFUGO_API_KEY) {
      return res.status(403).json({
        error: {
          code: 101,
          message: 'Unauthorized proxy request'
        }
      });
    }

    const result = await proxyHandler.handleProxy(proxyRequest);
    res.json(result);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: {
        code: 500,
        message: 'Internal proxy error'
      }
    });
  }
});

/**
 * Get user info
 */
app.get('/api/users/:userId', (req, res) => {
  const user = db.getUser(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

/**
 * Publish message to channel (server-side)
 */
app.post('/api/publish', async (req, res) => {
  try {
    const { channel, data } = req.body;

    if (!channel || !data) {
      return res.status(400).json({ error: 'channel and data are required' });
    }

    // Server-side publish using Centrifugo API
    const response = await axios.post(
      `${CONFIG.CENTRIFUGO_URL}/api/publish`,
      {
        channel,
        data
      },
      {
        headers: {
          'Authorization': `apikey ${CONFIG.CENTRIFUGO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Publish error:', error);
    res.status(500).json({ error: 'Failed to publish message' });
  }
});

/**
 * Get channel presence
 */
app.get('/api/presence/:channel', async (req, res) => {
  try {
    const response = await axios.post(
      `${CONFIG.CENTRIFUGO_URL}/api/presence`,
      {
        channel: req.params.channel
      },
      {
        headers: {
          'Authorization': `apikey ${CONFIG.CENTRIFUGO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get presence' });
  }
});

/**
 * Test endpoint - get test users
 */
app.get('/api/test/users', (req, res) => {
  res.json({
    users: [
      { id: 'user_123', name: 'John Doe', role: 'admin' },
      { id: 'user_456', name: 'Jane Smith', role: 'member' }
    ],
    rooms: [
      { id: 'room_456', name: 'General Chat' },
      { id: 'room_789', name: 'Admin Channel' }
    ]
  });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`
  🚀 Centrifugo Test Server running on port ${PORT}

  Endpoints:
  ──────────────────────────────
  GET    /api/health                    - Health check
  POST   /api/token/connection         - Get connection JWT
  POST   /api/token/subscription       - Get subscription JWT
  POST   /api/token/revoke            - Revoke user tokens
  POST   /api/centrifugo/proxy        - Centrifugo proxy endpoint
  POST   /api/publish                 - Server-side publish
  GET    /api/presence/:channel       - Get channel presence
  GET    /api/users/:userId          - Get user info
  GET    /api/test/users             - Test users

  Configuration:
  ──────────────────────────────
  Centrifugo URL: ${CONFIG.CENTRIFUGO_URL}
  JWT Secret: ${CONFIG.JWT_SECRET.substring(0, 8)}...
  Token Expiry: ${CONFIG.TOKEN_EXPIRY}

  Test Users:
  ──────────────────────────────
  Admin:    user_123 (John Doe)
  Member:   user_456 (Jane Smith)

  Test Rooms:
  ──────────────────────────────
  room_456 - General Chat
  room_789 - Admin Channel

  Example curl commands:
  ──────────────────────────────
  # Get connection token
  curl -X POST http://localhost:${PORT}/api/token/connection \\
    -H "Content-Type: application/json" \\
    -d '{"userId":"user_123"}'

  # Get subscription token
  curl -X POST http://localhost:${PORT}/api/token/subscription \\
    -H "Content-Type: application/json" \\
    -d '{"userId":"user_123","channel":"room-events:room_456"}'

  # Publish message (server-side)
  curl -X POST http://localhost:${PORT}/api/publish \\
    -H "Content-Type: application/json" \\
    -d '{"channel":"room-events:room_456","data":{"text":"Hello from server!"}}'
  `);
});
