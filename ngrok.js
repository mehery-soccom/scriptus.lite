const config = require('@bootloader/config');
const {setup,start} = require("@bootloader/local");
start({
  script : `${process.argv[2]}`,
  debug : true
}).then(function({url}){
  console.log("ngrok.url:2",config.store("ngrok").url)
  console.log("publicUrl",url);
  console.log("thisScript", process.argv[1])
  console.log("runScript", process.argv[2])
});
