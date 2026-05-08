// ─── Inventory (all require token) ───────────────────────────────────────────
const inventoryPaths = {
  '/api/inventory/list': { get: { summary: 'Get all inventory items', tags: ['Inventory'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Array of inventory items' }, 401: { description: 'No token' } } } },
  '/api/inventory/get/{id}': { get: { summary: 'Get inventory item by ID', tags: ['Inventory'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Inventory item' }, 404: { description: 'Not found' } } } },
  '/api/inventory/create': {
    post: {
      summary: 'Create inventory item', tags: ['Inventory'], security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'sku', 'category', 'supplierName', 'quantity', 'unit', 'price'], properties: { name: { type: 'string', example: 'Ankara Fabric' }, sku: { type: 'string', example: 'ANK001' }, category: { type: 'string', example: 'Fabric' }, subcategory: { type: 'string' }, supplierName: { type: 'string', example: 'Lagos Textiles' }, quantity: { type: 'number', example: 10 }, unit: { type: 'string', example: 'yards' }, price: { type: 'number', example: 2500 }, reorderPoint: { type: 'number', example: 3 }, color: { type: 'string' }, description: { type: 'string' } } } } } },
      responses: { 201: { description: 'Created' }, 401: { description: 'No token' } },
    },
  },
  '/api/inventory/edit/{id}': { put: { summary: 'Edit inventory item', tags: ['Inventory'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { quantity: { type: 'number' }, price: { type: 'number' }, status: { type: 'string' } } } } } }, responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } } } },
  '/api/inventory/delete/{id}': { delete: { summary: 'Delete inventory item', tags: ['Inventory'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } } } },
};

// ─── Invoice (all require token) ─────────────────────────────────────────────
const invoicePaths = {
  '/api/invoice/list': { get: { summary: 'Get all invoices', tags: ['Invoice'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Array of invoices sorted by createdAt desc' }, 401: { description: 'No token' } } } },
  '/api/invoice/get/{id}': { get: { summary: 'Get invoice by ID', tags: ['Invoice'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Invoice object' }, 404: { description: 'Not found' } } } },
  '/api/invoice/create': {
    post: {
      summary: 'Create invoice', tags: ['Invoice'], security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['invoiceNumber', 'clientName'], properties: { invoiceNumber: { type: 'string', example: 'INV-2025-0001' }, clientName: { type: 'string', example: 'Jane Doe' }, clientEmail: { type: 'string' }, clientPhone: { type: 'string' }, status: { type: 'string', example: 'Unpaid' }, paymentMethod: { type: 'string', example: 'Cash' }, dueDate: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, quantity: { type: 'number' }, price: { type: 'number' } } } }, subtotal: { type: 'number' }, discount: { type: 'number' }, taxRate: { type: 'number' }, taxAmount: { type: 'number' }, amount: { type: 'number' }, notes: { type: 'string' } } } } } },
      responses: { 201: { description: 'Invoice created' }, 401: { description: 'No token' } },
    },
  },
  '/api/invoice/edit/{id}': { put: { summary: 'Edit invoice', tags: ['Invoice'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, amount: { type: 'number' } } } } } }, responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } } } },
  '/api/invoice/delete/{id}': { delete: { summary: 'Delete invoice', tags: ['Invoice'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } } } },
};

// ─── Order (all require token) ────────────────────────────────────────────────
const orderPaths = {
  '/api/order/list': { get: { summary: 'Get all orders', tags: ['Order'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Array of orders' }, 401: { description: 'No token' } } } },
  '/api/order/get/{id}': { get: { summary: 'Get order by ID', tags: ['Order'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Order object' }, 404: { description: 'Not found' } } } },
  '/api/order/create': {
    post: {
      summary: 'Create order', tags: ['Order'], security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['clientName', 'garmentType'], properties: { clientName: { type: 'string', example: 'Jane Doe' }, clientPhone: { type: 'string' }, clientId: { type: 'string' }, garmentType: { type: 'string', example: 'Dresses' }, garmentDescription: { type: 'string', example: 'Ankara Maxi Dress' }, fabric: { type: 'string' }, quantity: { type: 'number', example: 1 }, price: { type: 'number', example: 85000 }, deposit: { type: 'number' }, balance: { type: 'number' }, dueDate: { type: 'string' }, status: { type: 'string', example: 'in-progress' }, specialInstructions: { type: 'string' }, measurements: { type: 'object' } } } } } },
      responses: { 201: { description: 'Order created' }, 401: { description: 'No token' } },
    },
  },
  '/api/order/edit/{id}': { put: { summary: 'Edit order', tags: ['Order'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, price: { type: 'number' } } } } } }, responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } } } },
  '/api/order/delete/{id}': { delete: { summary: 'Delete order', tags: ['Order'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } } } },
};

// ─── Transaction (all require token) ─────────────────────────────────────────
const transactionPaths = {
  '/api/transaction/list': { get: { summary: 'Get all transactions', tags: ['Transaction'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Array of transactions sorted by createdAt desc' }, 401: { description: 'No token' } } } },
  '/api/transaction/get/{id}': { get: { summary: 'Get transaction by ID', tags: ['Transaction'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Transaction object' }, 404: { description: 'Not found' } } } },
  '/api/transaction/create': {
    post: {
      summary: 'Create transaction', tags: ['Transaction'], security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['description', 'amount', 'type', 'category', 'date'], properties: { description: { type: 'string', example: 'Fabric purchase' }, amount: { type: 'number', example: 15000 }, type: { type: 'string', enum: ['Income', 'Expense'], example: 'Expense' }, category: { type: 'string', example: 'Materials' }, date: { type: 'string', example: '2025-08-01' }, paymentMethod: { type: 'string', example: 'Cash' }, reference: { type: 'string' }, notes: { type: 'string' } } } } } },
      responses: { 201: { description: 'Transaction created' }, 401: { description: 'No token' } },
    },
  },
  '/api/transaction/edit/{id}': { put: { summary: 'Edit transaction', tags: ['Transaction'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { amount: { type: 'number' }, description: { type: 'string' } } } } } }, responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } } } },
  '/api/transaction/delete/{id}': { delete: { summary: 'Delete transaction', tags: ['Transaction'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } } } },
};

// ─── Feedback (all require token) ────────────────────────────────────────────
const feedbackPaths = {
  '/api/feedback/list': { get: { summary: 'Get all feedback for authenticated user', tags: ['Feedback'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Array of feedback sorted by createdAt desc' }, 401: { description: 'No token' } } } },
  '/api/feedback/get/{id}': { get: { summary: 'Get feedback by ID', tags: ['Feedback'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Feedback object' }, 404: { description: 'Not found' } } } },
  '/api/feedback/create': {
    post: {
      summary: 'Create feedback', tags: ['Feedback'], security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['clientName', 'rating', 'comment'], properties: { clientName: { type: 'string', example: 'Jane Doe' }, clientEmail: { type: 'string' }, rating: { type: 'number', example: 5 }, comment: { type: 'string', example: 'Excellent service!' }, productName: { type: 'string' }, orderNumber: { type: 'string' }, invoiceNumber: { type: 'string' }, status: { type: 'string', example: 'approved' }, isPublic: { type: 'boolean', example: true } } } } } },
      responses: { 201: { description: 'Feedback created' }, 401: { description: 'No token' } },
    },
  },
  '/api/feedback/edit/{id}': { put: { summary: 'Edit feedback', tags: ['Feedback'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { rating: { type: 'number' }, comment: { type: 'string' }, status: { type: 'string' } } } } } }, responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } } } },
  '/api/feedback/reply/{id}': { put: { summary: 'Reply to feedback', tags: ['Feedback'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reply'], properties: { reply: { type: 'string', example: 'Thank you for your feedback!' } } } } } }, responses: { 200: { description: 'Reply saved' }, 404: { description: 'Not found' } } } },
  '/api/feedback/delete/{id}': { delete: { summary: 'Delete feedback', tags: ['Feedback'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } } } },
};

// ─── Loyalty Member (all require token) ──────────────────────────────────────
const loyaltyMemberPaths = {
  '/api/loyalty-member/list': { get: { summary: 'Get all loyalty members sorted by points desc', tags: ['Loyalty Member'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Array of loyalty members' }, 401: { description: 'No token' } } } },
  '/api/loyalty-member/get/{id}': { get: { summary: 'Get loyalty member by ID', tags: ['Loyalty Member'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Loyalty member object' }, 404: { description: 'Not found' } } } },
  '/api/loyalty-member/create': {
    post: {
      summary: 'Create loyalty member', tags: ['Loyalty Member'], security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'email'], properties: { name: { type: 'string', example: 'Jane Doe' }, email: { type: 'string', example: 'jane@example.com' }, level: { type: 'string', example: 'Bronze' }, points: { type: 'number', example: 0 }, totalSpent: { type: 'number', example: 0 }, birthday: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } } } } } },
      responses: { 201: { description: 'Loyalty member created' }, 401: { description: 'No token' } },
    },
  },
  '/api/loyalty-member/edit/{id}': { put: { summary: 'Edit loyalty member', tags: ['Loyalty Member'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { level: { type: 'string' }, points: { type: 'number' }, totalSpent: { type: 'number' } } } } } }, responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } } } },
  '/api/loyalty-member/delete/{id}': { delete: { summary: 'Delete loyalty member', tags: ['Loyalty Member'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } } } },
};

// ─── Payment (all require token) ─────────────────────────────────────────────
const paymentPaths = {
  '/api/payment/list': { get: { summary: 'Get all payments for authenticated user', tags: ['Payment'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Array of payment records sorted by createdAt desc' }, 401: { description: 'No token' } } } },
  '/api/payment/get/{id}': { get: { summary: 'Get payment by ID', tags: ['Payment'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Payment object' }, 404: { description: 'Not found' } } } },
  '/api/payment/create': {
    post: {
      summary: 'Record a subscription payment', tags: ['Payment'], security: [{ bearerAuth: [] }],
      description: 'Called automatically by the subscription callback after successful Flutterwave payment.',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { plantype: { type: 'string', example: 'GROWTH' }, planPrice: { type: 'number', example: 15000 }, status: { type: 'string', example: 'successful' }, gateway: { type: 'string', example: 'flutterwave' }, transactionId: { type: 'string', example: 'tx_ref_value' }, providerTransactionId: { type: 'string', example: '12345678' }, paidAt: { type: 'string', example: '2025-08-01T10:00:00.000Z' } } } } } },
      responses: { 201: { description: 'Payment record created' }, 401: { description: 'No token' } },
    },
  },
  '/api/payment/delete/{id}': { delete: { summary: 'Delete payment record', tags: ['Payment'], security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } } } },
};

// ─── Subscription Cancelation (no token) ─────────────────────────────────────
const subscriptionCancelationPaths = {
  '/api/subscription-cancelation/create': {
    post: {
      summary: 'Cancel a user subscription and save cancellation record',
      tags: ['Subscription Cancelation'],
      description: 'Saves the cancellation reason and resets the user subscription to free in MongoDB.',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['userEmail', 'reason'], properties: { userEmail: { type: 'string', example: 'jane@example.com' }, userId: { type: 'string' }, userName: { type: 'string', example: 'Jane Doe' }, planType: { type: 'string', example: 'Growth' }, subscriptionType: { type: 'string', example: 'paid' }, reason: { type: 'string', example: 'Too expensive' }, subscriptionEndDate: { type: 'string' }, isTrialActive: { type: 'boolean' } } } } } },
      responses: { 201: { description: 'Subscription cancelled and record saved' }, 500: { description: 'Server error' } },
    },
  },
  '/api/subscription-cancelation/get/{id}': { get: { summary: 'Get cancellation record by MongoDB _id', tags: ['Subscription Cancelation'], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Cancellation record' }, 404: { description: 'Not found' } } } },
  '/api/subscription-cancelation/get-by-email/{email}': { get: { summary: 'Get all cancellations by user email', tags: ['Subscription Cancelation'], parameters: [{ in: 'path', name: 'email', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Array of cancellation records' } } } },
};

// ─── Upload (no token) ───────────────────────────────────────────────────────
const uploadPaths = {
  '/api/upload': {
    post: {
      summary: 'Upload an image to Cloudinary',
      tags: ['Upload'],
      description: 'Accepts a single image file (max 5MB). Returns the Cloudinary URL.',
      requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['image'], properties: { image: { type: 'string', format: 'binary', description: 'Image file (PNG, JPG, etc.)' } } } } } },
      responses: { 200: { description: 'Returns { success: true, url, public_id }' }, 400: { description: 'No file provided' }, 500: { description: 'Cloudinary upload error' } },
    },
  },
};

// ─── Setting (no token) ──────────────────────────────────────────────────────
const settingPaths = {
  '/api/setting/create': { post: { summary: 'Create user setting', tags: ['Setting'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, userEmail: { type: 'string' } } } } } }, responses: { 201: { description: 'Created' } } } },
  '/api/setting/get/{id}': { get: { summary: 'Get setting by ID', tags: ['Setting'], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Setting object' }, 404: { description: 'Not found' } } } },
  '/api/setting/get-by-email/{email}': { get: { summary: 'Get setting by user email', tags: ['Setting'], parameters: [{ in: 'path', name: 'email', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Setting object' }, 404: { description: 'Not found' } } } },
  '/api/setting/edit/{id}': { put: { summary: 'Edit setting', tags: ['Setting'], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } } },
  '/api/setting/delete/{id}': { delete: { summary: 'Delete setting', tags: ['Setting'], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } } },
};

// ─── SMS (stub — no token) ───────────────────────────────────────────────────
const smsPaths = {
  '/api/sms/create': { post: { summary: 'Create SMS record (stub)', tags: ['SMS'], description: '⚠️ Not yet implemented.', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', example: { to: '+2348012345678', message: 'Hello!' } } } } }, responses: { 200: { description: 'Request received (stub)' } } } },
  '/api/sms/get/{id}': { get: { summary: 'Get SMS by ID (stub)', tags: ['SMS'], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Request received (stub)' } } } },
  '/api/sms/get-by-email/{email}': { get: { summary: 'Get SMS by email (stub)', tags: ['SMS'], parameters: [{ in: 'path', name: 'email', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Request received (stub)' } } } },
};

// ─── Reward (no token) ───────────────────────────────────────────────────────
const rewardPaths = {
  '/api/reward/create': { post: { summary: 'Create reward', tags: ['Reward'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, tailorId: { type: 'string' }, name: { type: 'string' }, points: { type: 'number' } } } } } }, responses: { 201: { description: 'Created' } } } },
  '/api/reward/get/{id}': { get: { summary: 'Get reward by ID', tags: ['Reward'], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Reward object' }, 404: { description: 'Not found' } } } },
  '/api/reward/get-by-email/{email}': { get: { summary: 'Get rewards by tailor email', tags: ['Reward'], parameters: [{ in: 'path', name: 'email', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Array of rewards' } } } },
  '/api/reward/edit/{id}': { put: { summary: 'Edit reward', tags: ['Reward'], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } } },
  '/api/reward/delete/{id}': { delete: { summary: 'Delete reward', tags: ['Reward'], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } } },
};

// ─── System Setting ───────────────────────────────────────────────────────────
const systemSettingPaths = {
  '/api/system-setting/subscription': {
    get: { summary: 'Get subscription kill-switch status (public)', tags: ['System Setting'], responses: { 200: { description: 'Returns { subscriptionsEnabled: boolean }' } } },
    put: { summary: 'Toggle subscription kill-switch (admin JWT required)', tags: ['System Setting'], security: [{ bearerAuth: [] }], description: 'Requires admin JWT from /api/admin/login.', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['subscriptionsEnabled'], properties: { subscriptionsEnabled: { type: 'boolean', example: false } } } } } }, responses: { 200: { description: 'Updated' }, 400: { description: 'subscriptionsEnabled must be a boolean' }, 401: { description: 'Admin token required' } } },
  },
  '/api/system-setting/all': { get: { summary: 'Get all system settings', tags: ['System Setting'], responses: { 200: { description: 'Array of system settings' } } } },
  '/api/system-setting/get/{id}': { get: { summary: 'Get system setting by ID', tags: ['System Setting'], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Setting object' }, 404: { description: 'Not found' } } } },
};

// ─── Contact (public) ─────────────────────────────────────────────────────────
const contactPaths = {
  '/api/contact/send': {
    post: {
      summary: 'Send a contact message from the website contact form',
      tags: ['Contact'],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'email', 'message'], properties: { name: { type: 'string', example: 'Jane Doe' }, email: { type: 'string', example: 'jane@example.com' }, company: { type: 'string' }, phone: { type: 'string' }, subject: { type: 'string', example: 'Pricing inquiry' }, message: { type: 'string', example: 'I would like to know more about your plans.' }, priority: { type: 'string', enum: ['low', 'medium', 'high'], example: 'medium' } } } } } },
      responses: { 201: { description: 'Message sent successfully' }, 400: { description: 'name, email and message are required' }, 500: { description: 'Server error' } },
    },
  },
};

// ─── Demo Request (public) ────────────────────────────────────────────────────
const demoRequestPaths = {
  '/api/demo-request/create': {
    post: {
      summary: 'Submit a demo request from the Schedule a Demo page',
      tags: ['Demo Request'],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['fullName', 'email', 'phoneNumber', 'businessName', 'preferredDate', 'preferredTime'], properties: { fullName: { type: 'string', example: 'Jane Doe' }, email: { type: 'string', example: 'jane@example.com' }, phoneNumber: { type: 'string', example: '08012345678' }, businessName: { type: 'string', example: 'Jane Designs' }, businessType: { type: 'string', example: 'fashion-designer' }, preferredDate: { type: 'string', example: '2025-09-01' }, preferredTime: { type: 'string', example: '10:00' }, message: { type: 'string' } } } } } },
      responses: { 201: { description: 'Demo request submitted successfully' }, 400: { description: 'Required fields missing' }, 500: { description: 'Server error' } },
    },
  },
};

module.exports = {
  ...inventoryPaths,
  ...invoicePaths,
  ...orderPaths,
  ...transactionPaths,
  ...feedbackPaths,
  ...loyaltyMemberPaths,
  ...paymentPaths,
  ...subscriptionCancelationPaths,
  ...uploadPaths,
  ...settingPaths,
  ...smsPaths,
  ...rewardPaths,
  ...systemSettingPaths,
  ...contactPaths,
  ...demoRequestPaths,
};
