const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const Order = require('../models/Design');  // Orders use the Design model with type: "order"
const Inventory = require('../models/Inventory');
const Appointment = require('../models/Appointment');

const getDashboardStats = async (req, res) => {
  try {
    const email = req.effectiveEmail;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const todayStr = now.toISOString().split('T')[0];

    const [clients, orders, invoices, inventory, appointments] = await Promise.all([
      Client.find({ userEmail: email }),
      Order.find({ userEmail: email, $or: [{ type: 'order' }, { type: { $exists: false } }, { type: '' }] }),
      Invoice.find({ userEmail: email }),
      Inventory.find({ userEmail: email }),
      Appointment.find({ userEmail: email }),
    ]);

    // Revenue
    const isCurrentMonth = (dateStr) => {
      const d = new Date(dateStr);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    };
    const isLastMonth = (dateStr) => {
      const d = new Date(dateStr);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    };

    const currentMonthRevenue = invoices
      .filter(i => isCurrentMonth(i.createdAt))
      .reduce((sum, i) => sum + (i.amount || i.subtotal || 0), 0);

    const lastMonthRevenue = invoices
      .filter(i => isLastMonth(i.createdAt))
      .reduce((sum, i) => sum + (i.amount || i.subtotal || 0), 0);

    const revenueGrowth = lastMonthRevenue > 0
      ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : 0;

    // Clients
    const newClientsThisMonth = clients.filter(c => isCurrentMonth(c.createdAt)).length;

    // Orders
    const pendingOrders = orders.filter(o =>
      ['Active', 'In Progress', 'Pending', 'in-progress'].includes(o.status)
    ).length;
    const ordersThisWeek = orders.filter(o => new Date(o.createdAt) >= weekAgo).length;

    // Inventory
    const inventoryValue = inventory.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 0)), 0);

    // Completion rate
    const completedOrders = orders.filter(o => o.status === 'Completed').length;
    const completionRate = orders.length > 0 ? (completedOrders / orders.length) * 100 : 0;

    // Average order value
    const averageOrderValue = orders.length > 0
      ? orders.reduce((sum, o) => sum + (o.price || 0), 0) / orders.length
      : 0;

    // Today's appointments
    const todaysAppointments = appointments
      .filter(a => a.date === todayStr)
      .map(a => ({
        id: a.id || a._id,
        title: a.purpose || a.appointmentType || 'Appointment',
        clientName: a.clientName || 'Unknown Client',
        date: a.date || '',
        time: a.time || '',
        status: a.status || 'Scheduled',
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    // Sales chart — last 12 months
    const salesChart = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const monthRevenue = invoices
        .filter(inv => {
          const id = new Date(inv.createdAt);
          return id.getMonth() === m && id.getFullYear() === y;
        })
        .reduce((sum, inv) => sum + (inv.amount || inv.subtotal || 0), 0);

      salesChart.push({
        month: d.toLocaleString('default', { month: 'short' }),
        year: y,
        revenue: monthRevenue,
      });
    }

    res.json({
      success: true,
      data: {
        totalRevenue: currentMonthRevenue,
        revenueGrowth,
        activeClients: clients.length,
        newClientsThisMonth,
        pendingOrders,
        ordersThisWeek,
        inventoryValue,
        totalInventoryItems: inventory.length,
        completionRate,
        clientSatisfaction: 0, // no feedback model yet
        averageOrderValue,
        todaysAppointments,
        salesChart,
        lastUpdated: now.toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getDashboardStats };
