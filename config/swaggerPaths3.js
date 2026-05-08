// ─── Admin Auth (no token for login/logout) ───────────────────────────────────
const adminAuthPaths = {
  '/api/admin/login': {
    post: {
      summary: 'Admin login with secret code',
      tags: ['Admin - Auth'],
      description: 'Validates the code against fashiontally_admin_credentials in MongoDB. Returns a 12h admin JWT.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code'],
              properties: {
                code: { type: 'string', example: 'your-secret-admin-code' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Login successful — returns { success: true, token }' },
        400: { description: 'Code is required' },
        401: { description: 'Invalid or inactive code' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/admin/logout': {
    post: {
      summary: 'Admin logout (clears cookie)',
      tags: ['Admin - Auth'],
      responses: {
        200: { description: 'Logged out successfully' },
      },
    },
  },
};

// ─── Admin Dashboard (admin JWT required) ─────────────────────────────────────
const adminDashboardPaths = {
  '/api/admin/stats': {
    get: {
      summary: 'Get platform-wide dashboard statistics',
      tags: ['Admin - Dashboard'],
      security: [{ bearerAuth: [] }],
      description: 'Aggregates data across ALL users. Returns total users, active users, revenue, transactions, appointments, recent activity, and monthly growth.',
      responses: {
        200: {
          description: 'Returns { totalUsers, activeUsers, totalRevenue, totalTransactions, totalAppointments, recentUsers, recentTransactions, recentAppointments, usersByRole, transactionsByType, appointmentsByStatus, monthlyGrowth }',
        },
        401: { description: 'Admin token required' },
        500: { description: 'Server error' },
      },
    },
  },
};

// ─── Admin Users (admin JWT required) ─────────────────────────────────────────
const adminUsersPaths = {
  '/api/admin/users/list': {
    get: {
      summary: 'Get all platform users and sub-admins',
      tags: ['Admin - Users'],
      security: [{ bearerAuth: [] }],
      description: 'Returns two arrays: users (fashiontally_users) and admins (fashiontally_subadmins), each with a userType field.',
      responses: {
        200: { description: 'Returns { users: [...], admins: [...] }' },
        401: { description: 'Admin token required' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/admin/users/edit/{userType}/{id}': {
    put: {
      summary: 'Edit a user or sub-admin',
      tags: ['Admin - Users'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'userType', required: true, schema: { type: 'string', enum: ['user', 'admin'] }, description: 'user = regular user, admin = sub-admin' },
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Email or MongoDB _id of the user' },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name:     { type: 'string', example: 'Jane Updated' },
                phone:    { type: 'string', example: '08012345678' },
                role:     { type: 'string', example: 'Designer' },
                country:  { type: 'string', example: 'Nigeria' },
                state:    { type: 'string', example: 'Lagos' },
                isActive: { type: 'boolean', example: false },
                status:   { type: 'string', example: 'inactive' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'User updated successfully' },
        401: { description: 'Admin token required' },
        404: { description: 'User not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/admin/users/delete/{userType}/{id}': {
    delete: {
      summary: 'Permanently delete a user or sub-admin',
      tags: ['Admin - Users'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'userType', required: true, schema: { type: 'string', enum: ['user', 'admin'] } },
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Email or MongoDB _id' },
      ],
      responses: {
        200: { description: 'User deleted successfully' },
        401: { description: 'Admin token required' },
        404: { description: 'User not found' },
        500: { description: 'Server error' },
      },
    },
  },
};

// ─── Admin Subscriptions (admin JWT required) ──────────────────────────────────
const adminSubscriptionsPaths = {
  '/api/admin/subscriptions/list': {
    get: {
      summary: 'Get all users with subscription data and stats',
      tags: ['Admin - Subscriptions'],
      security: [{ bearerAuth: [] }],
      description: 'Returns users array with subscription fields plus stats: { totalUsers, subscribedUsers, trialUsers, monthlyRevenue }.',
      responses: {
        200: { description: 'Returns { users: [...], stats: { totalUsers, subscribedUsers, trialUsers, monthlyRevenue } }' },
        401: { description: 'Admin token required' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/admin/subscriptions/grant-trial': {
    post: {
      summary: 'Grant a trial subscription to a user',
      tags: ['Admin - Subscriptions'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'planType', 'months'],
              properties: {
                email:    { type: 'string', example: 'jane@example.com' },
                planType: { type: 'string', enum: ['Starter', 'Growth', 'Professional'], example: 'Growth' },
                months:   { type: 'number', example: 1, description: 'Number of months for the trial' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Trial granted successfully' },
        400: { description: 'email, planType and months are required' },
        401: { description: 'Admin token required' },
        404: { description: 'User not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/admin/subscriptions/cancel': {
    post: {
      summary: 'Cancel a user subscription (admin override)',
      tags: ['Admin - Subscriptions'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', example: 'jane@example.com' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Subscription cancelled — user reset to free plan' },
        400: { description: 'email is required' },
        401: { description: 'Admin token required' },
        404: { description: 'User not found' },
        500: { description: 'Server error' },
      },
    },
  },
};

// ─── Measurement (all require user JWT) ──────────────────────────────────────
const measurementPaths = {
  '/api/measurement/create': {
    post: {
      summary: 'Create one or more measurements for a client',
      tags: ['Measurement'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['clientId', 'measurements'],
              properties: {
                clientId: { type: 'string', description: 'Client email address', example: 'jane@example.com' },
                measurements: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['name', 'value'],
                    properties: {
                      name:  { type: 'string', example: 'Waist' },
                      value: { type: 'string', example: '32' },
                      unit:  { type: 'string', example: 'inches' },
                    },
                  },
                  example: [
                    { name: 'Chest', value: '38', unit: 'inches' },
                    { name: 'Waist', value: '32', unit: 'inches' },
                  ],
                },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Measurements created — returns { success, data, warning? }. warning is set if some names were skipped as duplicates.' },
        400: { description: 'clientId or measurements missing, or all measurements already exist for this client' },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/measurement/list/{clientId}': {
    get: {
      summary: 'Get all measurements for a client',
      tags: ['Measurement'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'clientId',
          required: true,
          schema: { type: 'string' },
          description: 'Client email address (URL-encoded)',
          example: 'jane%40example.com',
        },
      ],
      responses: {
        200: { description: 'Returns array of measurement objects sorted by createdAt ascending' },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/measurement/edit/{id}': {
    put: {
      summary: 'Edit a measurement by its id',
      tags: ['Measurement'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, example: '1717000000001-xyz789' },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name:  { type: 'string', example: 'Waist' },
                value: { type: 'string', example: '34' },
                unit:  { type: 'string', example: 'inches' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Returns updated measurement object' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Measurement not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/measurement/delete/{id}': {
    delete: {
      summary: 'Delete a measurement by its id',
      tags: ['Measurement'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, example: '1717000000001-xyz789' },
      ],
      responses: {
        200: { description: 'Measurement deleted successfully' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Measurement not found' },
        500: { description: 'Server error' },
      },
    },
  },
};

// ─── Admin Inbox (admin JWT required) ─────────────────────────────────────────
const adminInboxPaths = {
  '/api/admin/inbox/contacts': {
    get: {
      summary: 'Get all contact messages (newest first)',
      tags: ['Admin - Inbox'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Array of contact messages with seen field' },
        401: { description: 'Admin token required' },
      },
    },
  },

  '/api/admin/inbox/contacts/{id}/seen': {
    put: {
      summary: 'Mark a contact message as seen',
      tags: ['Admin - Inbox'],
      security: [{ bearerAuth: [] }],
      description: 'Called automatically when the admin opens the detail panel.',
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Contact message custom id field' }],
      responses: {
        200: { description: 'Message marked as seen' },
        401: { description: 'Admin token required' },
        404: { description: 'Message not found' },
      },
    },
  },

  '/api/admin/inbox/demos': {
    get: {
      summary: 'Get all demo requests (newest first)',
      tags: ['Admin - Inbox'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Array of demo requests with seen field' },
        401: { description: 'Admin token required' },
      },
    },
  },

  '/api/admin/inbox/demos/{id}/seen': {
    put: {
      summary: 'Mark a demo request as seen',
      tags: ['Admin - Inbox'],
      security: [{ bearerAuth: [] }],
      description: 'Called automatically when the admin opens the detail panel.',
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Demo request custom id field' }],
      responses: {
        200: { description: 'Demo request marked as seen' },
        401: { description: 'Admin token required' },
        404: { description: 'Request not found' },
      },
    },
  },
};

module.exports = {
  ...adminAuthPaths,
  ...adminDashboardPaths,
  ...adminUsersPaths,
  ...adminSubscriptionsPaths,
  ...adminInboxPaths,
  ...measurementPaths,
};