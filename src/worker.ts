import { BodyAndContentType, Inviter, Registerer, SessionDescriptionHandlerModifier, SessionState, URI, UserAgent, UserAgentOptions } from 'sip.js';
import { SessionDescriptionHandler, SessionDescriptionHandlerOptions } from 'sip.js/lib/api/session-description-handler'

interface RegistrationData {
    proxyAddress: string
    exNumber: number
    userName: string
    password: string
    sipJslogLevel: LogLevel
    wsUrl: string
}
declare type LogLevel = "debug" | "log" | "warn" | "error";

let connectionPort: any;
let localDescription: any;
let userAgent: UserAgent;
let registerer: Registerer;
let inviter: Inviter;
let peerConnectionSignalingState: string| null;
let outGoingCall: boolean;
let registrationData: RegistrationData;


class CustomSessionDescriptionHandler implements SessionDescriptionHandler {
    close(): void {
        emitMessage('close');
    }
    hasDescription(contentType: string): boolean {
            return contentType === 'application/sdp'
    }
    rollbackDescription?(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    sendDtmf(tones: string, options?: unknown): boolean {
        throw new Error('Method not implemented.');
    }

    async getDescription(options?: SessionDescriptionHandlerOptions, modifiers?: Array<SessionDescriptionHandlerModifier>): Promise<BodyAndContentType> {
        if(outGoingCall)
            emitMessage('initPeerConnection');
        return Promise.resolve().then(() => {
            if(!outGoingCall) return;
            return emitMessage('getMediaStream');
        }).then(async () => {
            //TO-DO Need to handle this.
            await sleep(4);
            emitMessage('createOfferOrAnswer', {  modifiers });
            await sleep(4);
            if (!localDescription) await sleep(4);
            return localDescription;
        }).then((description) => {
            if (description.sdp === undefined) {
                throw ("SDP undefined.");
            }
            return {
                body: description.sdp,
                contentType: 'application/sdp'
            };
        });
    }
    setDescription(sessionDescription: string, options?: SessionDescriptionHandlerOptions | any, modifiers?: SessionDescriptionHandlerModifier[]): Promise<void> {
        if(!outGoingCall)
            emitMessage('initPeerConnection')
        if (!Array.isArray(modifiers)) {
            modifiers = [modifiers];
        }
        modifiers = modifiers.concat((this as any).modifiers);
        const description = {
            type: hasOffer("local") ? "answer" : "offer",
            sdp: sessionDescription
        };
        return Promise.resolve().then(() => {
            if(outGoingCall)return;
            return emitMessage('getMediaStream');
        }).then(() => reducePromises(modifiers, description))
            .catch((e) => {
                let message = "The modifiers did not resolve successfully.";
                if (e.name) {
                    message += " " + e.name;
                }
                if (e.message) {
                    message += " " + e.message;
                }
                throw message;
            }).then((modifiedDescription) => {
                emitMessage('setDescription', { modifiedDescription });
                return;
            }).catch((e) => {
                
                let message = "setRemoteDescription failed.";
                if (e.name) {
                    message += " " + e.name;
                }
                if (e.message) {
                    message += " " + e.message;
                }
                throw message;
            }).then(() => {
                return;
            });
    }
}

function hasOffer(where: string): boolean {
    const offerState = "have-" + where + "-offer";
    return peerConnectionSignalingState === offerState;
}
self.addEventListener("connect", function (connectEvent) {

    connectionPort = connectEvent.ports[0];

    connectionPort.addEventListener("message", function (event: any) {
        const data = event.data;
        console.log("onmessage ---", data);
        switch (data.type) {
            case 'register':
                registrationData = data.registrationData;
                register()
                break;
            case 'call':
                call(data.number);
                break;
            case 'localDescription':
                localDescription = data.localDescription;
                break;
            case 'SDHEvent':
                
                break;
            case 'peerConnectionSignalingState':
                peerConnectionSignalingState = data.peerConnectionSignalingState;
                break;
            case 'disconnect':
                localDescription = null;
                break;
            case 'reconnect':
                reconnectSession();
                break;
            case 'endSession':
                endSession();
                break;
            default:
                break;
        }

    });

    connectionPort.start();

}, false);

function emitMessage(type : string, data: any = {}) {
    connectionPort && connectionPort.postMessage && connectionPort.postMessage({ type, ...data })
}
function register() {
    const uri = UserAgent.makeURI(`sip:${registrationData.exNumber}@${registrationData.proxyAddress}`);
    const transportOptions = { server: registrationData.wsUrl }
    const userAgentOptions: UserAgentOptions = {
        authorizationPassword: registrationData.password,
        authorizationUsername: registrationData.userName,
        transportOptions,
        uri,
        logConfiguration: true,
        logLevel: registrationData.sipJslogLevel,
        sessionDescriptionHandlerFactory: () => {
            return new CustomSessionDescriptionHandler();
        }
    };
    userAgent = new UserAgent(userAgentOptions);
    registerer = new Registerer(userAgent);
    userAgent.start().then(() => {
        registerer.register().then(() => {
            registerer.stateChange.addListener((state) => {
                emitMessage('registrationState', { state: state === "Registered" })
            })

        });
    });
}

function call(number: number) {
    if (!number) {
        console.log('number required to invite');
        return;
    }
    const target : URI | any = UserAgent.makeURI(`sip:${number}@${registrationData.proxyAddress}`);
    inviter = new Inviter(userAgent, target);
    inviter.stateChange.addListener((state) => {
        console.log(`Session state changed to ${state}`);
        switch (state) {
            case SessionState.Initial:
                break;
            case SessionState.Establishing:
                break;
            case SessionState.Established:
                
                break;
            case SessionState.Terminating:
            // fall through
            case SessionState.Terminated:
                emitMessage('ended');
                break;
            default:
                throw new Error("Unknown session state.");
        }
    });
    outGoingCall = true;
    inviter.invite();
}

function sleep(seconds: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(true);
        }, seconds * 1000)
    })
}
function reducePromises(arr: Array<any>, val: any): Promise<any> {
    return arr.reduce((acc, fn) => {
        acc = acc.then(fn);
        return acc;
    }, Promise.resolve(val));
}

function endSession() {
    localDescription = null;
    outGoingCall = false;
    peerConnectionSignalingState = null;
    inviter && endCall();
    registerer && registerer.unregister();
    userAgent && userAgent.stop();
}

function endCall() {
    switch(inviter.state) {
      case SessionState.Initial:
      case SessionState.Establishing:
          inviter.cancel();
        break;
      case SessionState.Established:
        inviter.bye();
        break;
    }
  }
function reconnectSession() {
    inviter && inviter.invite();
}