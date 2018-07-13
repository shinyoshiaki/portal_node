import PortalNode from "../node/PortalNode";
import inquire from "inquirer";

const quesIsLocal = {
    type: "list",
    name: "isLocal",
    message: "is local?",
    choices: ["local", "global"]
  },
  quesMyPort = {
    type: "input",
    name: "myPort",
    message: "my port"
  },
  quesAddress = {
    type: "input",
    name: "address",
    message: "ip address"
  },
  quesPort = {
    type: "input",
    name: "port",
    message: "port"
  }

inquire
  .prompt([quesIsLocal, quesMyPort, quesAddress, quesPort])
  .then(answer => {
    let state = false;
    if (answer.isLocal === "local") state = true;
    new PortalNode(answer.myPort, answer.address, answer.port, state);    
  });
