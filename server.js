require("./core/babel-register"); // Ensure Babel is loaded first

const config = require('@bootloader/config');
const http = require('http');
const app = require('./core/app');
//const noway = require("./app/service/noway");

const port = process.env.PORT || config.get("server.port");
//Create a server
var server = http.createServer(app);

//Lets start our server
server.listen(port, function(){
    console.log("NGROK_URL:3",config.getIfPresent("NGROK_URL"))
    console.log("ngrok.url:3",config.store("ngrok").url)
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", port);
    //noway.emit('noway.started', null)
});

//setup();