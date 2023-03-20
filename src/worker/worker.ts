import { SipService } from "./sipService";


let connectionPort: any;
let sipInstance: SipService;


self.addEventListener("connect", (connectEvent) => {

    connectionPort = connectEvent.ports[0];

    connectionPort.addEventListener("message", ({ data }) => {
        if (data && data.type) {
            switch (data.type) {
                case 'register':
                    sipInstance = new SipService(data.registrationData)
                    sipInstance.once('message', emitMessage);
                    break;
                case 'call':
                    sipInstance.call(data.number);
                    break;
                case 'localDescription':
                    sipInstance.localDescription = data.localDescription;
                    break;
                case 'peerConnectionSignalingState':
                    sipInstance.peerConnectionSignalingState = data.peerConnectionSignalingState;
                    break;
                case 'disconnect':
                    sipInstance.localDescription = null;
                    break;
                case 'reconnect':
                    sipInstance.reconnectSession();
                    break;
                case 'endSession':
                    sipInstance.endSession();
                    sipInstance.off('message', emitMessage);
                    sipInstance = null;
                    break;
                default:
                    break;
            }
        }

    });

    connectionPort.start();

}, false);

const emitMessage = (type: string, data: any = {}) => {
    connectionPort && connectionPort.postMessage && connectionPort.postMessage({ type, ...data })
}

