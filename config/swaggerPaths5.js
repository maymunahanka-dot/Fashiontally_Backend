// ─── Notifications / Device Tokens ───────────────────────────────────────────

const notificationPaths = {

  // ── Register a device token ──────────────────────────────────────────────────
  '/api/user/fcm-token': {
    put: {
      summary: 'Register or update a device FCM token',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }],
      description:
        'Called by the app right after login. Adds the device to the user\'s token list. ' +
        'If the token already exists, only the platform/deviceName metadata is updated. ' +
        'All new devices default to `enabled: true`.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token'],
              properties: {
                token: {
                  type: 'string',
                  example: 'dGhpcyBpcyBhIHNhbXBsZSBmY20gdG9rZW4...',
                  description: 'FCM registration token from the device',
                },
                platform: {
                  type: 'string',
                  enum: ['ios', 'android', 'web'],
                  example: 'android',
                  description: 'The platform this device runs on',
                },
                deviceName: {
                  type: 'string',
                  example: 'Samsung S24',
                  description: 'Optional human-readable device name for display in the devices list',
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Device registered or updated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Device registered successfully' },
                },
              },
            },
          },
        },
        400: { description: 'token is required or platform is invalid' },
        401: { description: 'No token or invalid JWT' },
        500: { description: 'Server error' },
      },
    },

    delete: {
      summary: 'Remove a device token (logout)',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }],
      description:
        'Call this when the user logs out on a specific device. ' +
        'Removes only that device\'s token — other devices are unaffected.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token'],
              properties: {
                token: {
                  type: 'string',
                  example: 'dGhpcyBpcyBhIHNhbXBsZSBmY20gdG9rZW4...',
                  description: 'The FCM token of the device being logged out',
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Device removed successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Device removed successfully' },
                },
              },
            },
          },
        },
        400: { description: 'token is required' },
        401: { description: 'No token or invalid JWT' },
        500: { description: 'Server error' },
      },
    },
  },

  // ── Toggle per-device notifications ─────────────────────────────────────────
  '/api/user/notifications/toggle': {
    put: {
      summary: 'Turn notifications on or off for a specific device',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }],
      description:
        'Sets the `enabled` flag on one specific device token. ' +
        'When `enabled` is `false`, the notification service will skip that device — ' +
        'other devices for the same user are unaffected.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token', 'enabled'],
              properties: {
                token: {
                  type: 'string',
                  example: 'dGhpcyBpcyBhIHNhbXBsZSBmY20gdG9rZW4...',
                  description: 'The FCM token of the device to toggle',
                },
                enabled: {
                  type: 'boolean',
                  example: false,
                  description: 'true = notifications ON for this device, false = OFF',
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Notification preference updated for this device',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Notifications disabled for this device' },
                  enabled: { type: 'boolean', example: false },
                },
              },
            },
          },
        },
        400: { description: 'token is required or "enabled" must be a boolean' },
        401: { description: 'No token or invalid JWT' },
        404: { description: 'Device token not found for this user' },
        500: { description: 'Server error' },
      },
    },
  },

  // ── List all registered devices ──────────────────────────────────────────────
  '/api/user/devices': {
    get: {
      summary: 'List all registered devices for the authenticated user',
      tags: ['Notifications'],
      security: [{ bearerAuth: [] }],
      description:
        'Returns all devices the user has logged in from, including their platform, ' +
        'device name, registration date, and current notification enabled status.',
      responses: {
        200: {
          description: 'Array of registered device objects',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        index:        { type: 'number',  example: 0 },
                        platform:     { type: 'string',  example: 'ios' },
                        deviceName:   { type: 'string',  example: 'iPhone 14' },
                        addedAt:      { type: 'string',  example: '2026-07-06T08:00:00.000Z' },
                        enabled:      { type: 'boolean', example: true },
                        tokenPreview: { type: 'string',  example: 'dGhpcyBpc...' },
                        token:        { type: 'string',  example: 'dGhpcyBpcyBhIHNhbXBsZSBmY20gdG9rZW4...' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        401: { description: 'No token or invalid JWT' },
        404: { description: 'User not found' },
        500: { description: 'Server error' },
      },
    },
  },
};

module.exports = notificationPaths;
