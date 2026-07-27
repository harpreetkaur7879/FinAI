require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`FinAI server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
});
