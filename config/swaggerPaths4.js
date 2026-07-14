// ─── Support Tickets (user JWT required) ──────────────────────────────────────
const supportTicketPaths = {
  '/api/support-ticket/create': {
    post: {
      summary: 'Create a support ticket',
      tags: ['Support Tickets'],
      security: [{ bearerAuth: [] }],
      description: 'Accepts multipart/form-data. Up to 5 attachments (JPG, PNG, PDF, max 5 MB each). Ticket ID is generated server-side.',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['category', 'subIssue', 'description'],
              properties: {
                category:    { type: 'string', example: 'Dashboard & Analytics', description: 'Top-level category title' },
                subIssue:    { type: 'string', example: 'Dashboard not loading', description: 'Sub-issue title' },
                description: { type: 'string', example: 'The dashboard overview is blank after login.' },
                dateNoticed: { type: 'string', example: '2026-06-25', description: 'Date user noticed the issue (YYYY-MM-DD)' },
                attachments: {
                  type: 'array',
                  items: { type: 'string', format: 'binary' },
                  description: 'Up to 5 files (JPG, PNG, PDF)',
                },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Ticket created — returns full ticket object with generated SUP-YYYYMMDD-XXXXXX id' },
        400: { description: 'category, subIssue and description are required' },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/support-ticket/list': {
    get: {
      summary: 'Get all support tickets for the authenticated user',
      tags: ['Support Tickets'],
      security: [{ bearerAuth: [] }],
      description: 'Returns tickets sorted by createdAt descending (newest first).',
      responses: {
        200: { description: 'Array of ticket objects' },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/support-ticket/get/{id}': {
    get: {
      summary: 'Get a single support ticket by ID',
      tags: ['Support Tickets'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path', name: 'id', required: true,
          schema: { type: 'string' },
          example: 'SUP-20260629-AB12CD',
          description: 'The ticket custom id field',
        },
      ],
      responses: {
        200: { description: 'Returns the ticket object with full messages array' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Ticket not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/support-ticket/get/{id}/messages': {
    post: {
      summary: 'Add a user reply to a ticket thread',
      tags: ['Support Tickets'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path', name: 'id', required: true,
          schema: { type: 'string' },
          example: 'SUP-20260629-AB12CD',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['text'],
              properties: {
                text: { type: 'string', example: 'Still happening as of today.' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Message appended — returns updated ticket object' },
        400: { description: 'text is required, or ticket is resolved' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Ticket not found' },
        500: { description: 'Server error' },
      },
    },
  },
};

// ─── Admin: Support Tickets (admin JWT required) ───────────────────────────────
const adminSupportTicketPaths = {
  '/api/admin/support-tickets/list': {
    get: {
      summary: 'Get all support tickets across all users',
      tags: ['Admin - Support Tickets'],
      security: [{ bearerAuth: [] }],
      description: 'Sorted by createdAt descending. Optionally filter by status. Accepts admin or customer_service JWT.',
      parameters: [
        {
          in: 'query', name: 'status', required: false,
          schema: { type: 'string', enum: ['open', 'in_progress', 'resolved'] },
        },
      ],
      responses: {
        200: { description: 'Array of all ticket objects' },
        401: { description: 'Token required' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/admin/support-tickets/{id}': {
    get: {
      summary: 'Get a single support ticket by ID (admin/CS)',
      tags: ['Admin - Support Tickets'],
      security: [{ bearerAuth: [] }],
      description: 'No userEmail restriction — returns any ticket by its custom id. Accepts admin or customer_service JWT.',
      parameters: [
        {
          in: 'path', name: 'id', required: true,
          schema: { type: 'string' }, example: 'SUP-20260629-AB12CD',
        },
      ],
      responses: {
        200: { description: 'Returns the ticket object with full messages array' },
        401: { description: 'Token required' },
        404: { description: 'Ticket not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/admin/support-tickets/{id}/messages': {
    post: {
      summary: 'Admin reply to a support ticket thread',
      tags: ['Admin - Support Tickets'],
      security: [{ bearerAuth: [] }],
      description: 'Appends a support message. Automatically moves status from open → in_progress on first reply.',
      parameters: [
        {
          in: 'path', name: 'id', required: true,
          schema: { type: 'string' },
          example: 'SUP-20260629-AB12CD',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['text'],
              properties: {
                text: { type: 'string', example: 'We are looking into this. Can you confirm your browser?' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Reply appended — returns updated ticket object' },
        400: { description: 'text is required' },
        401: { description: 'Admin token required' },
        404: { description: 'Ticket not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/admin/support-tickets/{id}/status': {
    patch: {
      summary: 'Update the status of a support ticket',
      tags: ['Admin - Support Tickets'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path', name: 'id', required: true,
          schema: { type: 'string' },
          example: 'SUP-20260629-AB12CD',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: {
                  type: 'string',
                  enum: ['open', 'in_progress', 'resolved'],
                  example: 'resolved',
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Status updated — returns updated ticket object' },
        400: { description: 'status must be one of: open, in_progress, resolved' },
        401: { description: 'Admin token required' },
        404: { description: 'Ticket not found' },
        500: { description: 'Server error' },
      },
    },
  },
};

const customerServiceAuthPaths = {
  '/api/cs-auth/status': {
    get: {
      summary: 'Check if customer service password has been set',
      tags: ['Customer Service Auth'],
      description: 'Public endpoint. Returns isSet: false on first visit — frontend shows set-password form.',
      responses: {
        200: { description: 'Returns { success: true, isSet: boolean }' },
        500: { description: 'Server error' },
      },
    },
  },
  '/api/cs-auth/set-password': {
    post: {
      summary: 'Set the customer service password (first-time only)',
      tags: ['Customer Service Auth'],
      description: 'Only works when no password has been set yet. Returns a JWT on success.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object', required: ['password'],
              properties: { password: { type: 'string', example: 'mySecret123', description: 'Min 6 characters' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Password set — returns { success: true, token }' },
        400: { description: 'Password too short' },
        403: { description: 'Password already set' },
        500: { description: 'Server error' },
      },
    },
  },
  '/api/cs-auth/login': {
    post: {
      summary: 'Customer service login',
      tags: ['Customer Service Auth'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object', required: ['password'],
              properties: { password: { type: 'string', example: 'mySecret123' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Login successful — returns { success: true, token }' },
        400: { description: 'Password required' },
        401: { description: 'Incorrect password or no password set' },
        500: { description: 'Server error' },
      },
    },
  },
};

module.exports = {
  ...supportTicketPaths,
  ...adminSupportTicketPaths,
  ...customerServiceAuthPaths,
};
