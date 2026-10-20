const mongoose = require('mongoose');

const connectMongoDB = async () => {
  const conn = await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME,
  });
  console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  return conn;
};

module.exports = connectMongoDB;
