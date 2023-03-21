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
    private inviter: Inviter;
    private invitation: Invitation;
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
            this.invitation = invitation;
            this.emitMessage('gotInvitation');
        },
        onRefer(referral: Referral) {
            console.log("delegate onRefer")
            this.emitMessage('gotRefer');
        }

    }
    accept(){
        this.emitMessage('initPeerConnection');
        this.emitMessage('getMediaStream');
        this.invitation.accept();
        this.customSDH = (this.invitation.sessionDescriptionHandler as CustomSessionDescriptionHandler);
        this.listenCustomSDHEvents();
    }
    reject(){
        this.invitation.reject();
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
        this.inviter = new Inviter(this.userAgent, target);
        this.inviter.stateChange.addListener((state) => {
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
        this.inviter.invite();
        this.customSDH = (this.inviter.sessionDescriptionHandler as CustomSessionDescriptionHandler);
        this.listenCustomSDHEvents();
    }

    private listenCustomSDHEvents(){
        if(!this.customSDH) return;
        this.customSDH.on('remoteSDP', this.setRemoteSDP.bind(this));
        this.customSDH.on('createSDP', this.createSDP.bind(this));
        this.customSDH.on('closed',this.sendClosedEvent.bind(this));
    }

    private removeCustomSDHEvents(){
        if(!this.customSDH) return;
        this.customSDH.off('remoteSDP', this.setRemoteSDP.bind(this));
        this.customSDH.off('createSDP', this.createSDP.bind(this));
        this.customSDH.off('closed',this.sendClosedEvent.bind(this));
    }
    private setRemoteSDP(data: object) {
        this.emitMessage('setDescription', data)
    }
    private createSDP(data: object) {

        this.emitMessage('createOfferOrAnswer', data);
    }
    private sendClosedEvent(){
        this.emitMessage('end');
    }
    set peerConnectionSignalingState(val: string) {
        this.customSDH.peerConnectionSignalingState = val;
    }

    set localDescription(val: string) {
        this.customSDH.localDescription = val;
    }

    endSession() {
        this.removeCustomSDHEvents();
        this.inviter && this.endCall();
        this.registerer && this.registerer.unregister();
        this.userAgent && this.userAgent.stop();
        this.customSDH = null;
        this.inviter = null;
        this.registerer = null;
        this.userAgent = null;
    }

    endCall() {
        if(this.inviter){
            switch (this.inviter.state) {
                case SessionState.Initial:
                case SessionState.Establishing:
                    this.inviter.cancel();
                    break;
                case SessionState.Established:
                    this.inviter.bye();
                    break;
            }
        }else{
            switch (this.invitation.state) {
                case SessionState.Initial:
                case SessionState.Establishing:
                    this.invitation.reject();
                    break;
                case SessionState.Established:
                    this.invitation.bye();
                    break;
            }
        }
    }
    reconnectSession() {
        this.emitMessage('initPeerConnection');
        this.emitMessage('getMediaStream');
        this.inviter && this.inviter.invite();
        this.invitation && this.invitation.invite();
    }


}