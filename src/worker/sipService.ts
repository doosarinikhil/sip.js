import { Invitation, Inviter, Referral, Registerer, SessionState, URI, UserAgent, UserAgentDelegate, UserAgentOptions } from 'sip.js';
import { CustomEventClass } from "../helpers/events";
import { RegistrationData } from '../interfaces/interface';
import { CustomSessionDescriptionHandler } from './customSDH';


export class SipService extends CustomEventClass {
    constructor(registrationData: RegistrationData) {
        super();
        this.registrationData = registrationData;
        this.register();
    }
    private userAgent: UserAgent;
    private registerer: Registerer;
    private session: Inviter;
    private registrationData: RegistrationData
    private customSDH: CustomSessionDescriptionHandler;

    private userAgentDelegate: UserAgentDelegate = {
        onConnect() {
            console.log("delegate connected");
        },
        onDisconnect(error?: Error) {
            console.log("delegate disconnected")
        },
        onInvite(invitation: Invitation) {
            // TO-DO  we need to pass this event to the client, we can take action from there for accept /reject
            console.log("delegate onInvite")
            invitation.accept();
            this.session = invitation;
        },
        onRefer(referral: Referral) {
            console.log("delegate onRefer")
        }

    }

    private register() {
        const uri = UserAgent.makeURI(`sip:${this.registrationData.exNumber}@${this.registrationData.proxyAddress}`);
        const transportOptions = { server: this.registrationData.wsUrl }
        const userAgentOptions: UserAgentOptions = {
            authorizationPassword: this.registrationData.password,
            authorizationUsername: this.registrationData.userName,
            transportOptions,
            uri,
            logConfiguration: true,
            logLevel: this.registrationData.sipJslogLevel,
            delegate: this.userAgentDelegate,
            sessionDescriptionHandlerFactory: () => {
                return new CustomSessionDescriptionHandler();
            }
        };
        this.userAgent = new UserAgent(userAgentOptions);
        this.registerer = new Registerer(this.userAgent);
        this.userAgent.start().then(() => {
            this.registerer.register().then(() => {
                this.registerer.stateChange.addListener((state) => {
                    this.emitMessage('registrationState', { state: state === "Registered" })
                })

            });
        });
    }

    call(number: number) {
        if (!number) {
            console.log('number required to invite');
            return;
        }
        const target: URI | any = UserAgent.makeURI(`sip:${number}@${this.registrationData.proxyAddress}`);
        this.session = new Inviter(this.userAgent, target);
        this.session.stateChange.addListener((state) => {
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
                    this.emitMessage('ended');
                    break;
                default:
                    throw new Error("Unknown session state.");
            }
        });
        this.emitMessage('initPeerConnection');
        this.emitMessage('getMediaStream');
        this.session.invite();
        this.customSDH = (this.session.sessionDescriptionHandler as CustomSessionDescriptionHandler);
        this.customSDH.on('remoteSDP', this.setRemoteSDP.bind(this));
        this.customSDH.on('createSDP', this.createSDP.bind(this));
    }
    private setRemoteSDP(data: object) {
        this.emitMessage('setDescription', data)
    }
    private createSDP(data: object) {

        this.emitMessage('createOfferOrAnswer', data);
    }
    set peerConnectionSignalingState(val: string) {
        this.customSDH.peerConnectionSignalingState = val;
    }

    set localDescription(val: string) {
        this.customSDH.localDescription = val;
    }

    endSession() {
        this.session && this.endCall();
        this.customSDH.off('remoteSDP', this.setRemoteSDP);
        this.customSDH.off('createSDP', this.createSDP);
        this.registerer && this.registerer.unregister();
        this.userAgent && this.userAgent.stop();
        this.customSDH = null;
        this.session = null;
        this.registerer = null;
        this.userAgent = null;
    }

    endCall() {
        switch (this.session.state) {
            case SessionState.Initial:
            case SessionState.Establishing:
                this.session.cancel();
                break;
            case SessionState.Established:
                this.session.bye();
                break;
        }
    }
    reconnectSession() {
        this.emitMessage('initPeerConnection');
        this.emitMessage('getMediaStream');
        this.session && this.session.invite();
    }


}