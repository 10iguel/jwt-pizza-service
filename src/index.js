const app = require('./service.js');
const {sendMetricsPeriodically} = require("./metric");

const port = process.argv[2] || 3000;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
  sendMetricsPeriodically(1000)
});
