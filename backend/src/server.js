const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Durable jobs (outbox_jobs): opt-in per process; several replicas can run it at once.
if (process.env.OUTBOX_WORKER === '1') require('./services/outbox').start();
