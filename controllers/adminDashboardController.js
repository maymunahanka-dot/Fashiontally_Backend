const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Appointment = require('../models/Appointment');

const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Users
    const allUsers = await User.find({}).sort({ createdAt: -1 });
    const usersByRole = {};
    let activeUsers = 0;

    allUsers.forEach((u) => {
      const role = u.role || 'Designer';
      usersByRole[role] = (usersByRole[role] || 0) + 1;
      if (u.createdAt && new Date(u.createdAt) >= thirtyDaysAgo) activeUsers++;
    });

    const thisMonthUsers = allUsers.filter((u) => {
      const d = new Date(u.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    // Transactions (across all users)
    const allTransactions = await Transaction.find({}).sort({ createdAt: -1 }).limit(50);
    let incomeTotal = 0, expenseTotal = 0;

    allTransactions.forEach((t) => {
      if (t.type === 'Income') incomeTotal += t.amount || 0;
      else if (t.type === 'Expense') expenseTotal += t.amount || 0;
    });

    const thisMonthRevenue = allTransactions
      .filter((t) => {
        const d = new Date(t.createdAt);
        return t.type === 'Income' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    // Appointments
    const allAppointments = await Appointment.find({}).sort({ createdAt: -1 }).limit(30);
    const appointmentsByStatus = {};

    allAppointments.forEach((a) => {
      const status = a.status || 'Scheduled';
      appointmentsByStatus[status] = (appointmentsByStatus[status] || 0) + 1;
    });

    const thisMonthAppointments = allAppointments.filter((a) => {
      const d = new Date(a.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    res.json({
      success: true,
      data: {
        totalUsers: allUsers.length,
        activeUsers,
        totalRevenue: incomeTotal,
        totalTransactions: allTransactions.length,
        totalAppointments: allAppointments.length,
        recentUsers: allUsers.slice(0, 5),
        recentTransactions: allTransactions.slice(0, 5),
        recentAppointments: allAppointments.slice(0, 5),
        usersByRole,
        transactionsByType: { income: incomeTotal, expense: expenseTotal },
        appointmentsByStatus,
        monthlyGrowth: {
          users: thisMonthUsers,
          revenue: thisMonthRevenue,
          appointments: thisMonthAppointments,
        },
      },
    });
  } catch (error) {
    console.error('❌ Admin dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getDashboardStats };
