const paths2 = require('./swaggerPaths2');
const paths3 = require('./swaggerPaths3');
const paths4 = require('./swaggerPaths4');
const paths5 = require('./swaggerPaths5');

const paths = {
  '/api/auth/signup': {
    post: {
      summary: 'Register a new user',
      tags: ['Auth'],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'phone', 'password', 'country', 'businessName', 'category'],
              properties: {
                name:         { type: 'string', example: 'Jane Doe' },
                email:        { type: 'string', example: 'jane@example.com' },
                phone:        { type: 'string', example: '08012345678' },
                password:     { type: 'string', example: 'secret123' },
                country:      { type: 'string', example: 'Nigeria' },
                businessName: { type: 'string', example: 'Jane Designs' },
                category:     { type: 'string', example: 'Fashion Designer' },
                logo:         { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'User created successfully' },
        400: { description: 'Validation error or email already in use' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/auth/login': {
    post: {
      summary: 'Login with email and password',
      tags: ['Auth'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email:    { type: 'string', example: 'jane@example.com' },
                password: { type: 'string', example: 'secret123' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Login successful — returns JWT token and user object' },
        400: { description: 'Invalid email or password' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/auth/verify': {
    get: {
      summary: 'Verify JWT token',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Token is valid — returns decoded user' },
        401: { description: 'Invalid or expired token' },
      },
    },
  },

  '/api/auth/google': {
    post: {
      summary: 'Sign in with Google',
      tags: ['Auth'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['idToken'],
              properties: {
                idToken: { type: 'string', example: 'firebase-google-id-token' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Google sign-in successful — returns JWT token, user object, and isNewUser flag' },
        400: { description: 'idToken is required' },
        401: { description: 'Invalid or expired Google token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/auth/send-otp': {
    post: {
      summary: 'Send OTP to a phone number via WhatsApp',
      tags: ['Auth'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phone'],
              properties: {
                phone: { type: 'string', example: '+2348012345678' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'OTP sent via WhatsApp — returns { success, otp }' },
        400: { description: 'phone is required' },
        500: { description: 'Failed to send OTP' },
      },
    },
  },

  '/api/auth/send-email-otp': {
    post: {
      summary: 'Send OTP to an email address',
      tags: ['Auth'],
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
        200: { description: 'OTP sent via email — returns { success, otp }' },
        400: { description: 'email is required or invalid email address' },
        500: { description: 'Failed to send OTP' },
      },
    },
  },

  '/api/auth/forgot-password': {
    post: {
      summary: 'Send password reset email',
      tags: ['Auth'],
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
        200: { description: 'Reset email sent via Mailtrap' },
        404: { description: 'No account found with this email' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/auth/change-password': {
    post: {
      summary: 'Change password for authenticated user',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['currentPassword', 'newPassword'],
              properties: {
                currentPassword: { type: 'string', example: 'oldSecret123' },
                newPassword:     { type: 'string', example: 'newSecret456' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Password updated successfully' },
        400: { description: 'Current password is incorrect or validation failed' },
        401: { description: 'No token provided or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  '/api/dashboard/stats': {
    get: {
      summary: 'Get dashboard statistics for the authenticated user',
      tags: ['Dashboard'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Returns aggregated stats: revenue, clients, orders, inventory, appointments, sales chart, and today\'s appointments',
        },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  // ─── User ─────────────────────────────────────────────────────────────────────

  '/api/user/get': {
    get: {
      summary: 'Get the authenticated user\'s profile',
      tags: ['User'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Returns the user object from MongoDB' },
        401: { description: 'No token or invalid token' },
        404: { description: 'User not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/user/edit': {
    put: {
      summary: 'Update the authenticated user\'s profile',
      tags: ['User'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Any user fields to update (name, phone, country, businessName, subscriptionType, planType, etc.)',
              properties: {
                name:               { type: 'string', example: 'Jane Doe' },
                phone:              { type: 'string', example: '08012345678' },
                country:            { type: 'string', example: 'Nigeria' },
                businessName:       { type: 'string', example: 'Jane Designs' },
                isSubscribed:       { type: 'boolean', example: true },
                subscriptionType:   { type: 'string', example: 'paid' },
                planType:           { type: 'string', example: 'Growth' },
                subscriptionEndDate:{ type: 'string', example: '2025-12-31T00:00:00.000Z' },
                isTrialActive:      { type: 'boolean', example: false },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'User updated successfully' },
        401: { description: 'No token or invalid token' },
        404: { description: 'User not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/user/delete': {
    delete: {
      summary: 'Delete the authenticated user\'s account',
      tags: ['User'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'User deleted successfully' },
        401: { description: 'No token or invalid token' },
        404: { description: 'User not found' },
        500: { description: 'Server error' },
      },
    },
  },

  // ─── Sub-Admin ────────────────────────────────────────────────────────────────

  '/api/sub-admin/get': {
    get: {
      summary: 'Get all sub-admins invited by the authenticated user',
      tags: ['Sub-Admin'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Returns array of sub-admin objects' },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/sub-admin/create': {
    post: {
      summary: 'Create a new sub-admin (team member)',
      tags: ['Sub-Admin'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email'],
              properties: {
                name:        { type: 'string', example: 'John Staff' },
                email:       { type: 'string', example: 'john@example.com' },
                phone:       { type: 'string', example: '08098765432' },
                role:        { type: 'string', example: 'SubAdmin' },
                permissions: {
                  type: 'object',
                  example: { clients: true, orders: true, invoices: false },
                },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Sub-admin created — returns sub-admin object and generated password' },
        400: { description: 'name and email required, or email already in use' },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/sub-admin/edit': {
    put: {
      summary: 'Edit a sub-admin owned by the authenticated user',
      tags: ['Sub-Admin'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email:       { type: 'string', example: 'john@example.com' },
                name:        { type: 'string', example: 'John Updated' },
                phone:       { type: 'string', example: '08098765432' },
                role:        { type: 'string', example: 'SubAdmin' },
                permissions: { type: 'object', example: { clients: true, orders: false } },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Sub-admin updated successfully' },
        400: { description: 'email is required' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Sub-admin not found or not authorized' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/sub-admin/delete': {
    delete: {
      summary: 'Delete a sub-admin owned by the authenticated user',
      tags: ['Sub-Admin'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', example: 'john@example.com' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Sub-admin deleted successfully' },
        400: { description: 'email is required' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Sub-admin not found or not authorized' },
        500: { description: 'Server error' },
      },
    },
  },

  // ─── Campaign (stub — not yet implemented in DB) ─────────────────────────────

  '/api/campaign/create': {
    post: {
      summary: 'Create a campaign (stub)',
      tags: ['Campaign'],
      description: '⚠️ Not yet implemented — controller is a stub.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', example: { name: 'Summer Sale', message: 'Get 20% off!' } },
          },
        },
      },
      responses: {
        200: { description: 'Request received (stub)' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/campaign/get/{id}': {
    get: {
      summary: 'Get a campaign by ID (stub)',
      tags: ['Campaign'],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Request received (stub)' } },
    },
  },

  '/api/campaign/get-by-email/{email}': {
    get: {
      summary: 'Get campaigns by user email (stub)',
      tags: ['Campaign'],
      parameters: [{ in: 'path', name: 'email', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Request received (stub)' } },
    },
  },

  // ─── Appointment (all require token) ─────────────────────────────────────────

  '/api/appointment/list': {
    get: {
      summary: 'Get all appointments for the authenticated user',
      tags: ['Appointment'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Returns array of appointments sorted by date descending' },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/appointment/get/{id}': {
    get: {
      summary: 'Get a single appointment by ID',
      tags: ['Appointment'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Appointment custom id field' }],
      responses: {
        200: { description: 'Returns the appointment object' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Appointment not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/appointment/create': {
    post: {
      summary: 'Create a new appointment',
      tags: ['Appointment'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['clientName', 'date', 'time'],
              properties: {
                clientName:      { type: 'string', example: 'Jane Doe' },
                date:            { type: 'string', example: '2025-08-15' },
                time:            { type: 'string', example: '10:00 AM' },
                purpose:         { type: 'string', example: 'Fitting Session' },
                appointmentType: { type: 'string', example: 'Fitting Session' },
                duration:        { type: 'string', example: '1hr' },
                location:        { type: 'string', example: 'Shop' },
                phone:           { type: 'string', example: '08012345678' },
                email:           { type: 'string', example: 'jane@example.com' },
                notes:           { type: 'string', example: 'Bring fabric samples' },
                status:          { type: 'string', example: 'Scheduled' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Appointment created successfully' },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/appointment/edit/{id}': {
    put: {
      summary: 'Edit an appointment by ID',
      tags: ['Appointment'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                clientName: { type: 'string' },
                date:       { type: 'string' },
                time:       { type: 'string' },
                status:     { type: 'string', example: 'Completed' },
                notes:      { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Appointment updated successfully' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Appointment not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/appointment/delete/{id}': {
    delete: {
      summary: 'Delete an appointment by ID',
      tags: ['Appointment'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Appointment deleted successfully' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Appointment not found' },
        500: { description: 'Server error' },
      },
    },
  },

  // ─── Brand Setting (no token required) ───────────────────────────────────────

  '/api/brand-setting/create': {
    post: {
      summary: 'Create brand settings for a user',
      tags: ['Brand Setting'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['id', 'userEmail'],
              properties: {
                id:              { type: 'string', example: 'jane@example.com' },
                userEmail:       { type: 'string', example: 'jane@example.com' },
                businessName:    { type: 'string', example: 'Jane Designs' },
                businessEmail:   { type: 'string', example: 'jane@example.com' },
                businessPhone:   { type: 'string', example: '08012345678' },
                businessAddress: { type: 'string', example: '12 Lagos Street' },
                logoUrl:         { type: 'string', example: 'https://res.cloudinary.com/...' },
                primaryColor:    { type: 'string', example: '#16988d' },
                bankName:        { type: 'string', example: 'GTBank' },
                accountNumber:   { type: 'string', example: '0123456789' },
                accountName:     { type: 'string', example: 'Jane Designs Ltd' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Brand setting created successfully' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/brand-setting/get/{id}': {
    get: {
      summary: 'Get brand setting by ID',
      tags: ['Brand Setting'],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Returns the brand setting object' },
        404: { description: 'Brand setting not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/brand-setting/get-by-email/{email}': {
    get: {
      summary: 'Get brand setting by user email',
      tags: ['Brand Setting'],
      parameters: [{ in: 'path', name: 'email', required: true, schema: { type: 'string' }, example: 'jane@example.com' }],
      responses: {
        200: { description: 'Returns the brand setting object' },
        404: { description: 'Brand setting not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/brand-setting/edit/{id}': {
    put: {
      summary: 'Edit brand setting by ID',
      tags: ['Brand Setting'],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                businessName:  { type: 'string' },
                businessPhone: { type: 'string' },
                logoUrl:       { type: 'string' },
                primaryColor:  { type: 'string' },
                bankName:      { type: 'string' },
                accountNumber: { type: 'string' },
                accountName:   { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Brand setting updated successfully' },
        404: { description: 'Brand setting not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/brand-setting/delete/{id}': {
    delete: {
      summary: 'Delete brand setting by ID',
      tags: ['Brand Setting'],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Brand setting deleted successfully' },
        404: { description: 'Brand setting not found' },
        500: { description: 'Server error' },
      },
    },
  },

  // ─── Client (all require token) ───────────────────────────────────────────────

  '/api/client/list': {
    get: {
      summary: 'Get all clients for the authenticated user',
      tags: ['Client'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Returns array of client objects' },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/client/get/{id}': {
    get: {
      summary: 'Get a single client by ID',
      tags: ['Client'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Returns the client object' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Client not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/client/create': {
    post: {
      summary: 'Create a new client',
      tags: ['Client'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'phone'],
              properties: {
                name:    { type: 'string', example: 'Jane Doe' },
                email:   { type: 'string', example: 'jane@example.com' },
                phone:   { type: 'string', example: '08012345678' },
                address: { type: 'string', example: '12 Lagos Street' },
                status:  { type: 'string', example: 'Active' },
                notes:   { type: 'string', example: 'Prefers silk fabrics' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Client created successfully' },
        400: { description: 'Duplicate phone number' },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/client/edit/{id}': {
    put: {
      summary: 'Edit a client by ID',
      tags: ['Client'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name:    { type: 'string' },
                email:   { type: 'string' },
                phone:   { type: 'string' },
                address: { type: 'string' },
                status:  { type: 'string' },
                notes:   { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Client updated successfully' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Client not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/client/delete/{id}': {
    delete: {
      summary: 'Delete a client by ID',
      tags: ['Client'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Client deleted successfully' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Client not found' },
        500: { description: 'Server error' },
      },
    },
  },

  // ─── Design (all require token; create/edit use multipart/form-data) ──────────

  '/api/design/list': {
    get: {
      summary: 'Get designs for the authenticated user',
      tags: ['Design'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'type',
          required: false,
          schema: { type: 'string', enum: ['design', 'order'] },
          description: 'Filter by type. Use "design" for designs only, "order" for orders only (includes legacy records with no type). Omit to get all records.',
        },
      ],
      responses: {
        200: { description: 'Returns array of records sorted by createdAt descending' },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/design/get/{id}': {
    get: {
      summary: 'Get a single design by ID',
      tags: ['Design'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Returns the design object' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Design not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/design/create': {
    post: {
      summary: 'Create a new design (image uploaded to Cloudinary)',
      description: 'Send as multipart/form-data. The "data" field is a JSON string of all design fields. Optionally attach an image file. Set type="design" (default) or type="order" in the data JSON.',
      tags: ['Design'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['data'],
              properties: {
                data: {
                  type: 'string',
                  description: 'JSON string of design fields. All fields are optional except name.',
                  example: JSON.stringify({
                    type: 'design',
                    name: 'Ankara Maxi Dress',
                    category: 'Dresses',
                    customCategory: '',
                    description: 'Beautiful ankara dress',
                    price: 85000,
                    imageUrl: '',
                    images: [],
                    clientId: '',
                    clientName: 'Jane Doe',
                    clientPhone: '08012345678',
                    clientEmail: 'jane@example.com',
                    status: 'Active',
                    progress: 0,
                    dueDate: '2025-09-01',
                  }),
                },
                image: { type: 'string', format: 'binary', description: 'Optional design image (max 10MB)' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Design created — returns saved document' },
        401: { description: 'No token or invalid token' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/design/edit/{id}': {
    put: {
      summary: 'Edit a design by ID (optionally replace image)',
      tags: ['Design'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['data'],
              properties: {
                data: {
                  type: 'string',
                  description: 'JSON string of fields to update',
                  example: '{"name":"Updated Dress","price":90000,"status":"Completed"}',
                },
                image: { type: 'string', format: 'binary', description: 'Optional new image' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Design updated successfully' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Design not found' },
        500: { description: 'Server error' },
      },
    },
  },

  '/api/design/delete/{id}': {
    delete: {
      summary: 'Delete a design by ID',
      tags: ['Design'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Design deleted successfully' },
        401: { description: 'No token or invalid token' },
        404: { description: 'Design not found' },
        500: { description: 'Server error' },
      },
    },
  },
};

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'FashionTally API',
    version: '1.0.0',
    description: 'FashionTally backend API documentation',
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: { ...paths, ...paths2, ...paths3, ...paths4, ...paths5 },
};

module.exports = swaggerSpec;

// NOTE: Additional paths appended below — merged into paths object via Object.assign in swaggerSpec
