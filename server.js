require("./@core/babel-register"); // Ensure Babel is loaded first

const { name } = require("@bootloader/redison/info");
const { BootLoader } = require("./@core");

new BootLoader()
  .map({
    context: "/",
  })
  .map({
    name: "sample",
    context: "/",
  })
  .map({
    name: "jobs",
    context: "/jobs/",
  })
  .map({
    name: "chat",
    context: "/chat/",
  })
  .map({
    name: "scriptus",
    context: "/scriptus/",
  })
  .map({
    name: "scriptus-2",
    context: "/scriptus/",
  })
  .create(function ({ name, app }) {
    console.log(`APP[${name}]: Created`);
  })
  .launch(function ({ name, server }) {
    console.log(`APP[${name}]: Launched`);
  })
  .initJobs();

// Prevent crashes due to unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("🔥 Unhandled Promise Rejection:", err);
});

// Prevent crashes due to uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});
