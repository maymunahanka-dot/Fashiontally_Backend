const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
require('dotenv').config();

const app = express();

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Swagger ───────────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  swaggerOptions: { persistAuthorization: true },
}));

// ── MongoDB ───────────────────────────────────────────────────
const connectMongoDB = require('./config/mongodb');
connectMongoDB();

// No Firebase Admin — auth is fully MongoDB-based
console.log('✅ Auth: MongoDB-based (no Firebase)');

// ── Routes ────────────────────────────────────────────────────
const signupRoutes                  = require('./routes/signup');
const loginRoutes                   = require('./routes/login');
const googleAuthRoutes              = require('./routes/googleAuth');
const sendOtpRoutes                 = require('./routes/sendOtp');
const sendEmailOtpRoutes            = require('./routes/sendEmailOtp');
const forgotPasswordRoutes          = require('./routes/forgotPassword');
const resetPasswordRoutes           = require('./routes/resetPassword');
const changePasswordRoutes          = require('./routes/changePassword');
const dashboardRoutes               = require('./routes/dashboard');
const userRoutes                    = require('./routes/user');
const subAdminRoutes                = require('./routes/subAdmin');
const campaignRoutes                = require('./routes/campaign');
const demoRequestRoutes             = require('./routes/demoRequest');
const adminAuthRoutes               = require('./routes/adminAuth');
const adminDashboardRoutes          = require('./routes/adminDashboard');
const adminUsersRoutes              = require('./routes/adminUsers');
const adminSubscriptionsRoutes      = require('./routes/adminSubscriptions');
const adminInboxRoutes              = require('./routes/adminInbox');
const appointmentRoutes             = require('./routes/appointment');
const brandSettingRoutes            = require('./routes/brandSetting');
const clientRoutes                  = require('./routes/client');
const designRoutes                  = require('./routes/design');
const inventoryRoutes               = require('./routes/inventory');
const invoiceRoutes                 = require('./routes/invoice');
const orderRoutes                   = require('./routes/order');
const settingRoutes                 = require('./routes/setting');
const smsRoutes                     = require('./routes/sms');
const transactionRoutes             = require('./routes/transaction');
const feedbackRoutes                = require('./routes/feedback');
const loyaltyMemberRoutes           = require('./routes/loyaltyMember');
const paymentRoutes                 = require('./routes/payment');
const subscriptionCancelationRoutes = require('./routes/subscriptionCancelation');
const uploadRoutes                  = require('./routes/upload');
const rewardRoutes                  = require('./routes/reward');
const systemSettingRoutes           = require('./routes/systemSetting');
const contactRoutes                 = require('./routes/contact');
const measurementRoutes             = require('./routes/measurement');
const supportTicketRoutes           = require('./routes/supportTicket');
const adminSupportTicketRoutes      = require('./routes/adminSupportTicket');
const customerServiceAuthRoutes     = require('./routes/customerServiceAuth');

app.use('/api/auth', signupRoutes);
app.use('/api/auth', loginRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/auth', sendOtpRoutes);
app.use('/api/auth', sendEmailOtpRoutes);
app.use('/api/auth', forgotPasswordRoutes);
app.use('/api/auth', resetPasswordRoutes);
app.use('/api/auth', changePasswordRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/user', userRoutes);
app.use('/api/sub-admin', subAdminRoutes);
app.use('/api/campaign', campaignRoutes);
app.use('/api/appointment', appointmentRoutes);
app.use('/api/brand-setting', brandSettingRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/design', designRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/invoice', invoiceRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/setting', settingRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/loyalty-member', loyaltyMemberRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/subscription-cancelation', subscriptionCancelationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reward', rewardRoutes);
app.use('/api/system-setting', systemSettingRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/measurement', measurementRoutes);
app.use('/api/demo-request', demoRequestRoutes);
app.use('/api/admin', adminAuthRoutes);
app.use('/api/admin', adminDashboardRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/subscriptions', adminSubscriptionsRoutes);
app.use('/api/admin/inbox', adminInboxRoutes);
app.use('/api/support-ticket', supportTicketRoutes);
app.use('/api/admin/support-tickets', adminSupportTicketRoutes);
app.use('/api/cs-auth', customerServiceAuthRoutes);

// ── Protected test route ──────────────────────────────────────
const { verifyToken } = require('./middleware/auth');

app.get('/api/test-auth', verifyToken, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: req.user.email,
    effectiveEmail: req.effectiveEmail,
  });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Auth: MongoDB-based (no Firebase)`);
});

module.exports = {};
